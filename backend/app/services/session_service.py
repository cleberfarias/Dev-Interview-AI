from __future__ import annotations

from fastapi import HTTPException

from ..repositories import session_repository
from ..schemas import SessionAnalysisTraceResponse
from . import interview_core


def start_session(config, user):
    return interview_core.start_session(config, user)


def generate_plan(session_id: str, user):
    return interview_core.generate_plan(session_id, user)


def finish_session(session_id: str, payload, user):
    return interview_core.finish_session(session_id, payload, user)


def delete_session(session_id: str, user):
    return interview_core.delete_session(session_id, user)


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
