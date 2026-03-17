from __future__ import annotations

from typing import Any

from ..resume import matcher


def run(
    *,
    resume_skills: list[str],
    job_description: str,
    interview_signals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = matcher.match_resume_to_job(resume_skills or [], job_description or "")
    if not isinstance(interview_signals, dict):
        return payload

    communication = interview_signals.get("communicationSignals") if isinstance(interview_signals.get("communicationSignals"), dict) else {}
    behavior = interview_signals.get("behaviorProfile") if isinstance(interview_signals.get("behaviorProfile"), dict) else {}
    culture = interview_signals.get("cultureFitSignals") if isinstance(interview_signals.get("cultureFitSignals"), dict) else {}

    interview_signal_summary: list[str] = []
    if float(communication.get("professionalCommunication", 0.0) or 0.0) >= 7.0:
        interview_signal_summary.append("comunicacao profissional consistente")
    if float(culture.get("overallAlignment", 0.0) or 0.0) >= 7.0:
        interview_signal_summary.append("bom alinhamento cultural observado")
    if str(behavior.get("communicationStyle") or "").strip():
        interview_signal_summary.append(f"estilo observado: {behavior.get('communicationStyle')}")

    if interview_signal_summary:
        payload["interviewSignalSummary"] = interview_signal_summary[:3]
    return payload
