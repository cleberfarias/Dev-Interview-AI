from __future__ import annotations

from fastapi import HTTPException

from ..ai.router import AIProviderError
from ..schemas import FinalReport
from . import ai_observability_service, interview_core, memory_service


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
        if summary:
            scores_summary, criteria_summary, overall = summary
            report_data = report.model_dump()
            report_data["scoresSummary"] = scores_summary.model_dump()
            if criteria_summary:
                report_data["criteriaSummary"] = criteria_summary.model_dump()
            report_data["overallScore"] = overall
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
