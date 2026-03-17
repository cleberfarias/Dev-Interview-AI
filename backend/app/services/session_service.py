from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from fastapi import HTTPException

from ..repositories import candidate_profile_repository, report_repository, session_repository
from ..request_context import scoped_context
from ..schemas import (
    InterviewConfig,
    SessionAnalysisTraceResponse,
    SessionFinishRequest,
    SessionStartResponse,
)
from . import metrics_service, planning_service

logger = logging.getLogger("uvicorn.error")
FIXED_INTERVIEW_DURATION_MINUTES = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)


def _initial_credits() -> int:
    return _env_int("FREE_TRIAL_CREDITS", _env_int("DEFAULT_CREDITS", 3))


def _max_minutes_for_plan(plan: str | None) -> int:
    del plan
    return _env_int("INTERVIEW_FIXED_MINUTES", FIXED_INTERVIEW_DURATION_MINUTES)


def _clamp_duration_minutes(config: InterviewConfig) -> int:
    del config
    return _max_minutes_for_plan(None)


def _normalize_config(config: InterviewConfig) -> InterviewConfig:
    duration = _clamp_duration_minutes(config)
    if duration == config.duration:
        return config
    data = config.model_dump()
    data["duration"] = duration
    return InterviewConfig(**data)


def _session_analysis_trace_snapshot(user_uid: str, captured_at: str) -> dict | None:
    try:
        profile = candidate_profile_repository.get_profile(user_uid) or {}
    except Exception:
        logger.warning("Failed to read candidate profile trace snapshot for uid=%s", user_uid)
        return None

    if not isinstance(profile, dict):
        return None

    snapshot = {
        "capturedAt": captured_at,
        "lastResumeAnalysisTrace": profile.get("lastResumeAnalysisTrace"),
        "lastJobAnalysisTrace": profile.get("lastJobAnalysisTrace"),
    }
    audit = profile.get("analysisAudit")
    if isinstance(audit, list):
        snapshot["analysisAuditRecent"] = [item for item in audit[:5] if isinstance(item, dict)]

    has_trace_data = bool(
        snapshot.get("lastResumeAnalysisTrace")
        or snapshot.get("lastJobAnalysisTrace")
        or snapshot.get("analysisAuditRecent")
    )
    return snapshot if has_trace_data else None


def start_session(config: InterviewConfig, user: dict) -> SessionStartResponse:
    normalized_config = _normalize_config(config)
    try:
        ts = _now_iso()
        initial = _initial_credits()
        trace_snapshot = _session_analysis_trace_snapshot(user["uid"], ts)
        user_seed = {
            "uid": user["uid"],
            "name": user.get("name") or user.get("email", "Usuario").split("@")[0],
            "displayName": user.get("displayName") or user.get("name") or user.get("email", "Usuario").split("@")[0],
            "email": user.get("email", ""),
            "avatar": user.get("picture"),
            "photoURL": user.get("photoURL") or user.get("picture"),
            "plan": os.environ.get("DEFAULT_PLAN", "free"),
            "credits": initial,
            "createdAt": ts,
            "updatedAt": ts,
        }
        session_id, credits = session_repository.create_pending_session(
            uid=user["uid"],
            config=normalized_config.model_dump(),
            user_seed=user_seed,
            initial_credits=initial,
            now_iso=ts,
            analysis_trace_snapshot=trace_snapshot,
        )
    except Exception:
        logger.exception("start_session transaction failed")
        raise HTTPException(status_code=500, detail="Falha ao iniciar sessao")

    try:
        metrics_service.record_session_started(
            session_id=session_id,
            user_id=user.get("uid"),
            config=normalized_config,
        )
    except Exception:
        logger.exception("Failed to register interview_metrics start sessionId=%s", session_id)

    return SessionStartResponse(sessionId=session_id, plan=None, plan_status="pending", credits=credits)


def generate_plan(session_id: str, user: dict):
    with scoped_context(user_id=str(user.get("uid") or ""), session_id=session_id):
        return planning_service.generate_plan(session_id, user)


def finish_session(session_id: str, payload: SessionFinishRequest, user: dict):
    session = session_repository.get_session(session_id)
    if not session or session.get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    report = payload.report
    plan = (session or {}).get("plan", {}) or {}
    config = (session or {}).get("config", {}) or {}
    ts = _now_iso()

    history_item = {
        "id": session_id,
        "date": ts,
        "role": plan.get("roleTitleGuess", "Entrevista"),
        "score": float(report.overallScore),
        "style": config.get("style", ""),
        "track": config.get("track", ""),
    }

    report_repository.save_user_interview_history(
        uid=user["uid"],
        session_id=session_id,
        history_item=history_item,
        now_iso=ts,
    )
    session_repository.upsert_session(
        session_id,
        {
            "status": "finished",
            "report": report.model_dump(),
            "meta": payload.meta,
            "updatedAt": ts,
            "finishedAt": ts,
        },
        merge=True,
    )

    try:
        metrics_service.record_session_completed(
            session_id=session_id,
            user_id=user.get("uid"),
            report=report,
        )
    except Exception:
        logger.exception("Failed to register interview_metrics completion sessionId=%s", session_id)

    return {"ok": True}


def delete_session(session_id: str, user: dict):
    session = session_repository.get_session(session_id)

    if session and session.get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    if session:
        session_repository.delete_session(session_id)

    report_repository.delete_user_interview_history(uid=user["uid"], session_id=session_id)
    return {"ok": True}


def get_session_analysis_trace(session_id: str, user) -> SessionAnalysisTraceResponse:
    session = session_repository.get_session(session_id)
    if not session or session.get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    snapshot = session.get("analysisTraceSnapshot")
    has_trace = isinstance(snapshot, dict) and bool(snapshot)
    return SessionAnalysisTraceResponse(
        sessionId=session_id,
        hasTrace=has_trace,
        analysisTraceSnapshot=snapshot if has_trace else None,
    )
