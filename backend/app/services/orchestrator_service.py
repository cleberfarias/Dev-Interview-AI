from __future__ import annotations

import logging

from fastapi import HTTPException

from ..schemas import (
    OrchestratorContextRequest,
    OrchestratorContextResponse,
    OrchestratorFinalizeRequest,
    OrchestratorFinalizeResponse,
    OrchestratorStartRequest,
    OrchestratorStartResponse,
    OrchestratorTurnRequest,
    OrchestratorTurnResponse,
)
from . import interview_orchestrator

logger = logging.getLogger("uvicorn.error")


def build_context(payload: OrchestratorContextRequest, user: dict) -> OrchestratorContextResponse:
    data = interview_orchestrator.build_context(
        user=user,
        config=payload.config,
        resume_text=payload.resumeText,
        job_description=payload.jobDescription,
    )
    return OrchestratorContextResponse(**data)


def start(payload: OrchestratorStartRequest, user: dict) -> OrchestratorStartResponse:
    session_data = interview_orchestrator.start_session(config=payload.config, user=user)

    context = None
    if payload.includeContext:
        try:
            context_data = interview_orchestrator.build_context(
                user=user,
                config=payload.config,
                resume_text=payload.resumeText,
                job_description=payload.jobDescription,
            )
            context = OrchestratorContextResponse(**context_data)
        except Exception:
            logger.exception("Failed to precompute orchestrator context uid=%s", user.get("uid"))

    return OrchestratorStartResponse(session=session_data, context=context)


def run_turn(payload: OrchestratorTurnRequest, user: dict) -> OrchestratorTurnResponse:
    transcript = (payload.transcript or "").strip()
    audio_base64 = (payload.audioBase64 or "").strip()
    if not transcript and not audio_base64:
        raise HTTPException(status_code=400, detail="Provide transcript or audioBase64")

    try:
        data = interview_orchestrator.run_turn(
            user=user,
            config=payload.config,
            history=payload.history,
            question=payload.question,
            transcript=transcript or None,
            remaining_seconds=int(payload.remainingSeconds or 0),
            difficulty_level=payload.difficultyLevel,
            confirmed_name=payload.confirmedName,
            audio_base64=audio_base64 or None,
            mime_type=payload.mimeType,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return OrchestratorTurnResponse(**data)


def finalize(payload: OrchestratorFinalizeRequest, user: dict) -> OrchestratorFinalizeResponse:
    data = interview_orchestrator.finalize(
        user=user,
        config=payload.config,
        history=payload.history,
    )
    return OrchestratorFinalizeResponse(**data)
