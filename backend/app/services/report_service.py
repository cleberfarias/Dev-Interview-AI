from __future__ import annotations

from fastapi import HTTPException

from ..ai.router import AIProviderError
from ..agents import behavior_agent, culture_fit_agent
from ..schemas import FinalReport
from . import ai_observability_service, communication_analysis_service, interview_core, memory_service


REPORT_PROMPT_VERSION = "report_v3"


def final_report(payload, user):
    interview_core._ensure_credits(user["uid"], required=1)

    report_context = interview_core._build_report_context(user.get("uid"), payload.config, auth_token=user.get("token"))
    prompt = interview_core._build_report_prompt(payload.config, payload.history, report_context)
    summary = interview_core._summarize_scores(payload.history)
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
        communication_score = communication_analysis_service.build_communication_score(payload.history, report_data)
        communication_signals, behavioral_signals = communication_analysis_service.aggregate_signals_from_history(
            payload.history
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
        behavior_profile = behavior_agent.aggregate_from_history(payload.history)
        culture_fit_signals = culture_fit_agent.aggregate_from_history(payload.history)
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
