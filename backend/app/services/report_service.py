from __future__ import annotations

from fastapi import HTTPException

from ..ai.router import AIProviderError
from ..agents import behavior_agent, culture_fit_agent, job_agent, match_agent
from ..schemas import FinalReport
from . import (
    ai_observability_service,
    candidate_profile_service,
    communication_analysis_service,
    evaluation_service,
    interview_core,
    memory_service,
)


REPORT_PROMPT_VERSION = "report_v3"


def _safe_answer_id(item: dict, index: int) -> str:
    raw = str(item.get("answerId") or item.get("questionId") or f"answer-{index + 1}").strip()
    return raw or f"answer-{index + 1}"


def _safe_transcript(item: dict) -> str:
    if not isinstance(item, dict):
        return ""
    transcript = str(item.get("transcript") or "").strip()
    if transcript:
        return transcript
    evaluation = item.get("evaluation")
    if isinstance(evaluation, dict):
        return str(evaluation.get("transcript") or "").strip()
    return ""


def _enrich_history_for_final_report(payload, user) -> list[dict]:
    history = payload.history if isinstance(payload.history, list) else []
    if not history:
        return []

    try:
        profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    except Exception:
        profile = {}

    effective_job_description = str(payload.config.jobDescription or profile.get("jobDescription") or "").strip()
    resume_skills = profile.get("primarySkills") or payload.config.stacks or []
    job_context = job_agent.run(job_description=effective_job_description)

    enriched_history: list[dict] = []
    for index, raw_item in enumerate(history):
        if not isinstance(raw_item, dict):
            continue
        item = dict(raw_item)
        question = str(item.get("question") or "").strip()
        transcript = _safe_transcript(item)
        answer_id = _safe_answer_id(item, index)

        evaluation = item.get("evaluation")
        if not isinstance(evaluation, dict) and transcript and question:
            evaluation = evaluation_service.build_heuristic_text_evaluation(
                config=payload.config,
                question=question,
                transcript=transcript,
            ).model_dump()
        item["evaluation"] = evaluation if isinstance(evaluation, dict) else None
        item["transcript"] = transcript
        item["answerId"] = answer_id

        communication_analysis = item.get("communicationAnalysis")
        if not isinstance(communication_analysis, dict) and transcript:
            speech_metrics = communication_analysis_service.normalize_speech_metrics(item.get("speechMetrics"))
            communication_signals = communication_analysis_service.derive_communication_signals(
                transcript=transcript,
                speech_metrics=speech_metrics,
            )
            behavioral_signals = communication_analysis_service.derive_behavioral_speech_signals(
                transcript=transcript,
                speech_metrics=speech_metrics,
                communication_signals=communication_signals,
            )
            match_context = match_agent.run(
                resume_skills=resume_skills,
                job_description=effective_job_description,
                interview_signals={"communicationSignals": communication_signals.model_dump()},
            )
            behavior_profile = behavior_agent.run(
                transcript=transcript,
                communication_signals=communication_signals,
                behavioral_speech_signals=behavioral_signals,
                evaluation=item["evaluation"],
            )
            culture_fit = culture_fit_agent.run(
                transcript=transcript,
                communication_signals=communication_signals,
                behavioral_speech_signals=behavioral_signals,
                behavior_profile=behavior_profile,
                evaluation=item["evaluation"],
                job_context=job_context,
                match_context=match_context,
            )
            communication_analysis = {
                "answerId": answer_id,
                "mode": getattr(payload.config, "interviewMode", "candidate_coaching_mode"),
                "speechMetrics": speech_metrics.model_dump() if speech_metrics else None,
                "communicationSignals": communication_signals.model_dump(),
                "behavioralSpeechSignals": behavioral_signals.model_dump(),
                "behaviorProfile": behavior_profile.model_dump(),
                "cultureFitSignals": culture_fit.model_dump(),
            }
        item["communicationAnalysis"] = communication_analysis if isinstance(communication_analysis, dict) else None
        enriched_history.append(item)

    return enriched_history


def final_report(payload, user):
    interview_core._ensure_credits(user["uid"], required=1)

    enriched_history = _enrich_history_for_final_report(payload, user)
    report_context = interview_core._build_report_context(user.get("uid"), payload.config, auth_token=user.get("token"))
    prompt = interview_core._build_report_prompt(payload.config, enriched_history, report_context)
    summary = interview_core._summarize_scores(enriched_history)
    metadata = ai_observability_service.build_metadata(
        user=user,
        session_id=payload.sessionId,
        agent="report_agent",
        prompt_version=REPORT_PROMPT_VERSION,
    )
    try:
        result = interview_core.ai_router.generate(
            task_name="report",
            prompt=prompt,
            max_tokens=1200,
            temperature=0.2,
            response_mime_type="application/json",
            metadata=metadata,
        )
    except AIProviderError as e:
        interview_core._handle_ai_error(e)

    try:
        data = interview_core._safe_json_loads(result.output_text or "{}")
        report = FinalReport(**data)
        report_data = report.model_dump()
        if summary:
            scores_summary, criteria_summary, overall = summary
            report_data["scoresSummary"] = scores_summary.model_dump()
            if criteria_summary:
                report_data["criteriaSummary"] = criteria_summary.model_dump()
            report_data["overallScore"] = overall
        communication_score = communication_analysis_service.build_communication_score(enriched_history, report_data)
        communication_signals, behavioral_signals = communication_analysis_service.aggregate_signals_from_history(
            enriched_history
        )
        strengths, improvements = communication_analysis_service.build_communication_feedback(
            communication_score,
            communication_signals,
        )
        report_data["communicationScore"] = communication_score.model_dump()
        report_data["communicationStrengths"] = strengths
        report_data["communicationImprovements"] = improvements
        report_data["communicationSignals"] = (
            communication_signals.model_dump() if communication_signals else None
        )
        report_data["behavioralSpeechSignals"] = (
            behavioral_signals.model_dump() if behavioral_signals else None
        )
        behavior_profile = behavior_agent.aggregate_from_history(enriched_history)
        culture_fit_signals = culture_fit_agent.aggregate_from_history(enriched_history)
        report_data["behaviorProfile"] = behavior_profile.model_dump() if behavior_profile else None
        report_data["cultureFitSignals"] = (
            culture_fit_signals.model_dump() if culture_fit_signals else None
        )
        report = FinalReport(**report_data)
    except Exception:
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    try:
        memory_service.update_candidate_memory_after_report(
            user_id=user["uid"],
            report=report,
            config=payload.config,
        )
    except Exception:
        interview_core.logger.exception("Failed to update candidate memory uid=%s", user.get("uid"))

    interview_core._debit_credits(user["uid"], amount=1)
    return report


def ai_report(payload, user):
    return final_report(payload, user)
