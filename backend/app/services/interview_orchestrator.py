from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from ..agents import (
    candidate_agent,
    coach_agent,
    evaluator_agent,
    interviewer_agent,
    job_agent,
    match_agent,
    report_agent,
    study_plan_agent,
)
from ..schemas import (
    InterviewConfig,
    OrchestratorContextRequest,
    OrchestratorFinalizeRequest,
    OrchestratorStartRequest,
    OrchestratorTurnRequest,
)
from . import candidate_profile_service, interview_core

logger = logging.getLogger("uvicorn.error")


def build_context(
    *,
    user: dict,
    config: InterviewConfig,
    resume_text: str | None = None,
    job_description: str | None = None,
) -> dict[str, Any]:
    profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    candidate = candidate_agent.run(
        resume_text=resume_text or (profile.get("resumeSummary") or ""),
        profile=profile,
    )
    effective_job_description = (job_description or profile.get("jobDescription") or config.jobDescription or "").strip()
    job = job_agent.run(job_description=effective_job_description)
    match = match_agent.run(
        resume_skills=candidate.get("skills") or [],
        job_description=effective_job_description,
    )
    return {
        "profile": profile,
        "candidate": candidate,
        "job": job,
        "match": match,
    }


def start_session(*, config: InterviewConfig, user: dict) -> dict[str, Any]:
    response = interview_core.start_session(config, user)
    return response.model_dump()


def initial_next_question(
    *,
    user: dict,
    config: InterviewConfig,
    remaining_seconds: int,
    difficulty_level: int | None = None,
) -> dict[str, Any]:
    return interviewer_agent.run(
        config=config,
        history=[],
        remaining_seconds=max(0, int(remaining_seconds)),
        difficulty_level=difficulty_level,
        user=user,
    )


def run_turn(
    *,
    user: dict,
    config: InterviewConfig,
    history: list[dict],
    question: str,
    transcript: str | None,
    remaining_seconds: int,
    difficulty_level: int | None = None,
    confirmed_name: str | None = None,
    audio_base64: str | None = None,
    mime_type: str = "audio/webm",
) -> dict[str, Any]:
    transcript_text = (transcript or "").strip()
    audio_text = (audio_base64 or "").strip()
    if audio_text:
        evaluation = evaluator_agent.run_audio(
            config=config,
            question=question,
            audio_base64=audio_text,
            mime_type=mime_type,
            confirmed_name=confirmed_name,
            user=user,
        )
    elif transcript_text:
        evaluation = evaluator_agent.run_text(
            config=config,
            question=question,
            transcript=transcript_text,
            confirmed_name=confirmed_name,
            user=user,
        )
    else:
        raise ValueError("Either transcript or audio input is required")

    coach = coach_agent.run(evaluation=evaluation)

    normalized_history = [item for item in (history or []) if isinstance(item, dict)]
    next_history = [
        *normalized_history,
        {
            "question": question,
            "evaluation": evaluation,
        },
    ]

    next_question = interviewer_agent.run(
        config=config,
        history=next_history,
        remaining_seconds=remaining_seconds,
        difficulty_level=difficulty_level,
        user=user,
    )
    return {
        "evaluation": evaluation,
        "coach": coach,
        "nextQuestion": next_question,
    }


def finalize(*, user: dict, config: InterviewConfig, history: list[dict]) -> dict[str, Any]:
    report = report_agent.run(config=config, history=history, user=user)
    study_plan = study_plan_agent.run(report=report)
    return {
        "report": report,
        "studyPlan": study_plan,
    }


def build_orchestrated_context(*, payload: OrchestratorContextRequest, user: dict) -> dict[str, Any]:
    return build_context(
        user=user,
        config=payload.config,
        resume_text=payload.resumeText,
        job_description=payload.jobDescription,
    )


def start_orchestrated_interview(*, payload: OrchestratorStartRequest, user: dict) -> dict[str, Any]:
    session_data = start_session(config=payload.config, user=user)

    context = None
    if payload.includeContext:
        try:
            context = build_context(
                user=user,
                config=payload.config,
                resume_text=payload.resumeText,
                job_description=payload.jobDescription,
            )
        except Exception:
            logger.exception("Failed to precompute orchestrator context uid=%s", user.get("uid"))

    initial_next = None
    try:
        initial_next = initial_next_question(
            user=user,
            config=payload.config,
            remaining_seconds=max(0, int((payload.config.duration or 0) * 60)),
            difficulty_level=payload.difficultyLevel,
        )
    except Exception:
        logger.exception("Failed to precompute initial next-question uid=%s", user.get("uid"))

    return {
        "session": session_data,
        "context": context,
        "initialNextQuestion": initial_next,
    }


def run_orchestrated_turn(*, payload: OrchestratorTurnRequest, user: dict) -> dict[str, Any]:
    transcript = (payload.transcript or "").strip()
    audio_base64 = (payload.audioBase64 or "").strip()
    if not transcript and not audio_base64:
        raise HTTPException(status_code=400, detail="Provide transcript or audioBase64")

    try:
        return run_turn(
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


def finalize_orchestrated_interview(*, payload: OrchestratorFinalizeRequest, user: dict) -> dict[str, Any]:
    return finalize(
        user=user,
        config=payload.config,
        history=payload.history,
    )
