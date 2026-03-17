from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from ..avatar_engine import avatar_controller
from ..agents import (
    behavior_agent,
    candidate_agent,
    coach_agent,
    culture_fit_agent,
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
from ..request_context import scoped_context
from . import candidate_profile_service, memory_service, session_service
from . import communication_analysis_service

logger = logging.getLogger("uvicorn.error")


def _avatar_for_question(*, question_payload: dict[str, Any] | None, config: InterviewConfig) -> dict[str, Any] | None:
    if not isinstance(question_payload, dict):
        return None
    should_finish = bool(question_payload.get("shouldFinish"))
    if should_finish:
        return None
    question = question_payload.get("question")
    if not isinstance(question, dict):
        return None
    prompt = str(question.get("prompt") or "").strip()
    if not prompt:
        return None
    try:
        return avatar_controller.generate_avatar_response(
            text=prompt,
            language=config.interviewLanguage,
        )
    except Exception:
        logger.exception("Failed to generate avatar payload for question")
        return None


def build_context(
    *,
    user: dict,
    config: InterviewConfig,
    resume_text: str | None = None,
    job_description: str | None = None,
) -> dict[str, Any]:
    user_id = str(user.get("uid") or "")
    profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    candidate_memory = memory_service.load_candidate_memory(user_id)
    candidate = candidate_agent.run(
        resume_text=resume_text or (profile.get("resumeSummary") or ""),
        profile=profile,
    )
    effective_job_description = (job_description or profile.get("jobDescription") or config.jobDescription or "").strip()
    behavior_profile = candidate_memory.get("behaviorProfile") if isinstance(candidate_memory.get("behaviorProfile"), dict) else None
    culture_fit_profile = (
        candidate_memory.get("cultureFitSignals") if isinstance(candidate_memory.get("cultureFitSignals"), dict) else None
    )
    job = job_agent.run(job_description=effective_job_description)
    match = match_agent.run(
        resume_skills=candidate.get("skills") or [],
        job_description=effective_job_description,
        interview_signals={
            "behaviorProfile": behavior_profile,
            "cultureFitSignals": culture_fit_profile,
        },
    )
    return {
        "profile": profile,
        "candidate_memory": candidate_memory,
        "candidate": candidate,
        "job": job,
        "match": match,
        "behaviorProfile": behavior_profile,
        "cultureFitProfile": culture_fit_profile,
    }


def start_session(*, config: InterviewConfig, user: dict) -> dict[str, Any]:
    response = session_service.start_session(config, user)
    return response.model_dump()


def initial_next_question(
    *,
    user: dict,
    config: InterviewConfig,
    remaining_seconds: int,
    difficulty_level: int | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    return interviewer_agent.run(
        config=config,
        history=[],
        remaining_seconds=max(0, int(remaining_seconds)),
        difficulty_level=difficulty_level,
        user=user,
        session_id=session_id,
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
    answer_id: str | None = None,
    interview_mode: str | None = "candidate_coaching_mode",
    speech_metrics: dict[str, Any] | None = None,
    audio_base64: str | None = None,
    mime_type: str = "audio/webm",
    session_id: str | None = None,
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
            session_id=session_id,
        )
    elif transcript_text:
        evaluation = evaluator_agent.run_text(
            config=config,
            question=question,
            transcript=transcript_text,
            confirmed_name=confirmed_name,
            user=user,
            session_id=session_id,
        )
    else:
        raise ValueError("Either transcript or audio input is required")

    effective_transcript = str(evaluation.get("transcript") or transcript_text).strip()
    normalized_speech_metrics = communication_analysis_service.normalize_speech_metrics(speech_metrics)
    communication_signals = communication_analysis_service.derive_communication_signals(
        transcript=effective_transcript,
        speech_metrics=normalized_speech_metrics,
    )
    behavioral_speech_signals = communication_analysis_service.derive_behavioral_speech_signals(
        transcript=effective_transcript,
        speech_metrics=normalized_speech_metrics,
        communication_signals=communication_signals,
    )

    profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    effective_job_description = (config.jobDescription or profile.get("jobDescription") or "").strip()
    job_context = job_agent.run(job_description=effective_job_description)
    match_context = match_agent.run(
        resume_skills=profile.get("primarySkills") or config.stacks or [],
        job_description=effective_job_description,
        interview_signals={"communicationSignals": communication_signals.model_dump()},
    )
    behavior_profile = behavior_agent.run(
        transcript=effective_transcript,
        communication_signals=communication_signals,
        behavioral_speech_signals=behavioral_speech_signals,
        evaluation=evaluation,
    )
    culture_fit_signals = culture_fit_agent.run(
        transcript=effective_transcript,
        communication_signals=communication_signals,
        behavioral_speech_signals=behavioral_speech_signals,
        behavior_profile=behavior_profile,
        evaluation=evaluation,
        job_context=job_context,
        match_context=match_context,
    )

    coach = (
        coach_agent.run(evaluation=evaluation)
        if str(interview_mode or "candidate_coaching_mode") == "candidate_coaching_mode"
        else {"tips": [], "reinforce": [], "idealAnswerOutline": []}
    )

    communication_analysis = None
    if answer_id:
        communication_analysis = {
            "answerId": answer_id,
            "mode": str(interview_mode or "candidate_coaching_mode"),
            "speechMetrics": normalized_speech_metrics.model_dump() if normalized_speech_metrics else None,
            "communicationSignals": communication_signals.model_dump(),
            "behavioralSpeechSignals": behavioral_speech_signals.model_dump(),
            "behaviorProfile": behavior_profile.model_dump(),
            "cultureFitSignals": culture_fit_signals.model_dump(),
        }

    normalized_history = [item for item in (history or []) if isinstance(item, dict)]
    next_history = [
        *normalized_history,
        {
            "question": question,
            "evaluation": evaluation,
            "communicationAnalysis": communication_analysis,
        },
    ]

    next_question = interviewer_agent.run(
        config=config,
        history=next_history,
        remaining_seconds=remaining_seconds,
        difficulty_level=difficulty_level,
        user=user,
        session_id=session_id,
    )
    avatar = _avatar_for_question(question_payload=next_question, config=config)

    if answer_id:
        if session_id:
            try:
                session_service.store_answer_communication_analysis(session_id, answer_id, communication_analysis, user)
            except Exception:
                logger.exception("Failed to persist communication analysis sessionId=%s", session_id)

    return {
        "evaluation": evaluation,
        "coach": coach,
        "nextQuestion": next_question,
        "avatar": avatar,
        "communicationAnalysis": communication_analysis,
    }


def finalize(
    *,
    user: dict,
    config: InterviewConfig,
    history: list[dict],
    session_id: str | None = None,
) -> dict[str, Any]:
    report = report_agent.run(config=config, history=history, user=user, session_id=session_id)
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
    session_id = str(session_data.get("sessionId") or "").strip() or None

    context = None
    if payload.includeContext:
        try:
            with scoped_context(user_id=str(user.get("uid") or ""), session_id=session_id):
                context = build_context(
                    user=user,
                    config=payload.config,
                    resume_text=payload.resumeText,
                    job_description=payload.jobDescription,
                )
        except Exception:
            logger.exception("Failed to precompute orchestrator context uid=%s", user.get("uid"))

    initial_next = None
    initial_avatar = None
    try:
        with scoped_context(user_id=str(user.get("uid") or ""), session_id=session_id):
            initial_next = initial_next_question(
                user=user,
                config=payload.config,
                remaining_seconds=max(0, int((payload.config.duration or 0) * 60)),
                difficulty_level=payload.difficultyLevel,
                session_id=session_id,
            )
            initial_avatar = _avatar_for_question(question_payload=initial_next, config=payload.config)
    except Exception:
        logger.exception("Failed to precompute initial next-question uid=%s", user.get("uid"))

    return {
        "session": session_data,
        "context": context,
        "initialNextQuestion": initial_next,
        "initialAvatar": initial_avatar,
    }


def run_orchestrated_turn(*, payload: OrchestratorTurnRequest, user: dict) -> dict[str, Any]:
    transcript = (payload.transcript or "").strip()
    audio_base64 = (payload.audioBase64 or "").strip()
    if not transcript and not audio_base64:
        raise HTTPException(status_code=400, detail="Provide transcript or audioBase64")

    try:
        with scoped_context(user_id=str(user.get("uid") or ""), session_id=payload.sessionId):
            return run_turn(
                user=user,
                config=payload.config,
                history=payload.history,
                question=payload.question,
                transcript=transcript or None,
                remaining_seconds=int(payload.remainingSeconds or 0),
                difficulty_level=payload.difficultyLevel,
                confirmed_name=payload.confirmedName,
                answer_id=payload.answerId,
                interview_mode=payload.interviewMode,
                speech_metrics=payload.speechMetrics.model_dump() if payload.speechMetrics else None,
                audio_base64=audio_base64 or None,
                mime_type=payload.mimeType,
                session_id=payload.sessionId,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def finalize_orchestrated_interview(*, payload: OrchestratorFinalizeRequest, user: dict) -> dict[str, Any]:
    with scoped_context(user_id=str(user.get("uid") or ""), session_id=payload.sessionId):
        return finalize(
            user=user,
            config=payload.config,
            history=payload.history,
            session_id=payload.sessionId,
        )
