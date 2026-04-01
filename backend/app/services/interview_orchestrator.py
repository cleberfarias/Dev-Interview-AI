from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from ..agent_runtime import build_context_agent_runtime
from ..interview_rag import build_episode_memory_entry
from ..avatar_engine import avatar_controller
from ..knowledge_retrieval import build_knowledge_retrieval
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
    BehaviorProfile,
    BehavioralSpeechSignals,
    CultureFitSignals,
    HiringCommunicationSignals,
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


def _build_minimal_evaluation(transcript: str) -> dict[str, Any]:
    return {
        "transcript": transcript,
        "scores": {},
        "criteriaScores": {},
        "strengths": [],
        "improvements": [],
        "followUp": [],
        "reportStatus": "fallback",
        "reportSource": "local_fallback",
    }


def _build_minimal_report(history: list[dict[str, Any]]) -> dict[str, Any]:
    scores: list[float] = []
    for item in (history or []):
        if not isinstance(item, dict):
            continue
        eval_ = item.get("evaluation") or {}
        cs = {**(eval_.get("criteriaScores") or {}), **(eval_.get("scores") or {})}
        for v in cs.values():
            try:
                scores.append(float(v))
            except (TypeError, ValueError):
                pass
    overall = round(sum(scores) / len(scores), 2) if scores else 0.0
    return {
        "overallScore": overall,
        "levelEstimate": "unknown",
        "jobMatch": {"covered": [], "gaps": []},
        "feedbackByCategory": {},
        "plan7Days": [],
        "communicationScore": {},
        "reportStatus": "fallback",
        "reportSource": "local_fallback",
        "reportWarnings": [
            "Nao foi possivel gerar o relatorio com IA. Este resumo usa apenas dados locais da sessao."
        ],
    }


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
    agent_runtime = build_context_agent_runtime(
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
        match=match,
        resume_text=resume_text,
        job_description=effective_job_description,
        resume_analysis_trace=profile.get("lastResumeAnalysisTrace"),
        job_analysis_trace=profile.get("lastJobAnalysisTrace"),
    )
    knowledge_retrieval = build_knowledge_retrieval(
        user_id=user_id,
        auth_token=user.get("token"),
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
        match=match,
    )
    return {
        "profile": profile,
        "candidate_memory": candidate_memory,
        "candidate": candidate,
        "job": job,
        "match": match,
        "agentRuntime": agent_runtime,
        "knowledgeRetrieval": knowledge_retrieval,
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
    include_avatar: bool = False,
    client_runtime: dict | None = None,
) -> dict[str, Any]:
    transcript_text = (transcript or "").strip()
    audio_text = (audio_base64 or "").strip()
    if not transcript_text and not audio_text:
        raise ValueError("Either transcript or audio input is required")

    evaluation: dict[str, Any] | None = None
    if audio_text:
        try:
            evaluation = evaluator_agent.run_audio(
                config=config,
                question=question,
                audio_base64=audio_text,
                mime_type=mime_type,
                confirmed_name=confirmed_name,
                user=user,
                session_id=session_id,
            )
        except Exception:
            logger.exception("Audio evaluation failed, falling back to text uid=%s", user.get("uid"))
            if transcript_text:
                try:
                    evaluation = evaluator_agent.run_text(
                        config=config,
                        question=question,
                        transcript=transcript_text,
                        confirmed_name=confirmed_name,
                        user=user,
                        session_id=session_id,
                    )
                except Exception:
                    logger.exception("Text fallback evaluation also failed uid=%s", user.get("uid"))
    elif transcript_text:
        try:
            evaluation = evaluator_agent.run_text(
                config=config,
                question=question,
                transcript=transcript_text,
                confirmed_name=confirmed_name,
                user=user,
                session_id=session_id,
            )
        except Exception:
            logger.exception("Text evaluation failed uid=%s", user.get("uid"))

    if evaluation is None:
        logger.warning("All evaluation attempts failed, using minimal fallback uid=%s", user.get("uid"))
        evaluation = _build_minimal_evaluation(transcript_text)

    effective_transcript = str(evaluation.get("transcript") or transcript_text).strip()

    try:
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
    except Exception:
        logger.exception("Communication analysis failed uid=%s", user.get("uid"))
        normalized_speech_metrics = None
        communication_signals = HiringCommunicationSignals()
        behavioral_speech_signals = BehavioralSpeechSignals()

    profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    effective_job_description = (config.jobDescription or profile.get("jobDescription") or "").strip()

    try:
        job_context = job_agent.run(job_description=effective_job_description)
    except Exception:
        logger.exception("Job agent failed in turn uid=%s", user.get("uid"))
        job_context = {}

    try:
        match_context = match_agent.run(
            resume_skills=profile.get("primarySkills") or config.stacks or [],
            job_description=effective_job_description,
            interview_signals={"communicationSignals": communication_signals.model_dump() if hasattr(communication_signals, "model_dump") else {}},
        )
    except Exception:
        logger.exception("Match agent failed in turn uid=%s", user.get("uid"))
        match_context = {}

    try:
        behavior_profile = behavior_agent.run(
            transcript=effective_transcript,
            communication_signals=communication_signals,
            behavioral_speech_signals=behavioral_speech_signals,
            evaluation=evaluation,
        )
    except Exception:
        logger.exception("Behavior agent failed uid=%s", user.get("uid"))
        behavior_profile = BehaviorProfile()

    try:
        culture_fit_signals = culture_fit_agent.run(
            transcript=effective_transcript,
            communication_signals=communication_signals,
            behavioral_speech_signals=behavioral_speech_signals,
            behavior_profile=behavior_profile,
            evaluation=evaluation,
            job_context=job_context,
            match_context=match_context,
        )
    except Exception:
        logger.exception("Culture fit agent failed uid=%s", user.get("uid"))
        culture_fit_signals = CultureFitSignals()

    _empty_coach = {"tips": [], "reinforce": [], "idealAnswerOutline": []}
    try:
        coach = (
            coach_agent.run(evaluation=evaluation)
            if str(interview_mode or "candidate_coaching_mode") == "candidate_coaching_mode"
            else _empty_coach
        )
    except Exception:
        logger.exception("Coach agent failed uid=%s", user.get("uid"))
        coach = _empty_coach

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
    episode_memory = (
        build_episode_memory_entry(
            answer_id=str(answer_id or ""),
            question=question,
            transcript=effective_transcript,
            evaluation=evaluation,
            communication_analysis=communication_analysis,
        )
        if answer_id
        else None
    )

    normalized_history = [item for item in (history or []) if isinstance(item, dict)]
    next_history = [
        *normalized_history,
        {
            "answerId": answer_id,
            "question": question,
            "transcript": effective_transcript,
            "evaluation": evaluation,
            "communicationAnalysis": communication_analysis,
            "clientRuntime": client_runtime if isinstance(client_runtime, dict) else None,
        },
    ]

    try:
        next_question = interviewer_agent.run(
            config=config,
            history=next_history,
            remaining_seconds=remaining_seconds,
            difficulty_level=difficulty_level,
            user=user,
            session_id=session_id,
        )
    except Exception:
        logger.exception("Interviewer agent failed, signaling finish uid=%s", user.get("uid"))
        next_question = {"shouldFinish": True, "question": None}
    avatar = _avatar_for_question(question_payload=next_question, config=config) if include_avatar else None

    if answer_id:
        if session_id:
            try:
                session_service.store_answer_communication_analysis(session_id, answer_id, communication_analysis, user)
            except Exception:
                logger.exception("Failed to persist communication analysis sessionId=%s", session_id)
            try:
                if episode_memory:
                    session_service.store_answer_episode(session_id, answer_id, episode_memory, user)
            except Exception:
                logger.exception("Failed to persist episodic memory sessionId=%s", session_id)

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
    try:
        report = report_agent.run(config=config, history=history, user=user, session_id=session_id)
    except Exception:
        logger.exception("Report agent failed, using local fallback uid=%s", user.get("uid"))
        report = _build_minimal_report(history)

    study_plan: dict[str, Any] = {"weeklyPlan": []}
    try:
        study_plan = study_plan_agent.run(report=report)
    except Exception:
        logger.exception("Study plan agent failed uid=%s", user.get("uid"))

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
                include_avatar=payload.includeAvatar,
                client_runtime=payload.clientRuntime,
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
