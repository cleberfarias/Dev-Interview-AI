from __future__ import annotations

from typing import Any

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
from ..schemas import InterviewConfig
from . import candidate_profile_service, interview_core


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
