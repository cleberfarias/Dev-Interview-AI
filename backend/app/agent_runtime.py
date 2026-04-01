from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


AgentSource = Literal["system", "heuristic", "ai", "hybrid"]
AgentStatus = Literal["completed", "fallback", "skipped", "error"]


def _clamp_confidence(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except Exception:
        return None
    return round(max(0.0, min(1.0, numeric)), 2)


def _normalize_list(values: list[str] | None, limit: int = 8) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def _normalize_source(value: Any, default: AgentSource = "heuristic") -> AgentSource:
    normalized = str(value or "").strip().lower()
    if normalized in {"system", "heuristic", "ai", "hybrid"}:
        return normalized  # type: ignore[return-value]
    return default


def _trace_payload(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            value = None
    return value if isinstance(value, dict) else {}


@dataclass(slots=True)
class AgentRuntimeRecord:
    name: str
    status: AgentStatus = "completed"
    source: AgentSource = "system"
    confidence: float | None = None
    prompt_version: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    used_tools: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    summary: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "status": self.status,
            "source": self.source,
            "confidence": _clamp_confidence(self.confidence),
            "promptVersion": self.prompt_version,
            "aiProvider": self.ai_provider,
            "aiModel": self.ai_model,
            "usedTools": _normalize_list(self.used_tools),
            "evidence": _normalize_list(self.evidence),
            "summary": str(self.summary or "").strip() or None,
        }
        return {key: value for key, value in payload.items() if value not in (None, [], "")}


def build_agent_runtime_record(
    *,
    name: str,
    status: AgentStatus = "completed",
    source: AgentSource = "system",
    confidence: float | None = None,
    prompt_version: str | None = None,
    ai_provider: str | None = None,
    ai_model: str | None = None,
    used_tools: list[str] | None = None,
    evidence: list[str] | None = None,
    summary: str | None = None,
) -> dict[str, Any]:
    return AgentRuntimeRecord(
        name=name,
        status=status,
        source=source,
        confidence=confidence,
        prompt_version=prompt_version,
        ai_provider=ai_provider,
        ai_model=ai_model,
        used_tools=list(used_tools or []),
        evidence=list(evidence or []),
        summary=summary,
    ).to_dict()


def build_context_agent_runtime(
    *,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
    match: dict[str, Any],
    resume_text: str | None = None,
    job_description: str | None = None,
    resume_analysis_trace: dict[str, Any] | None = None,
    job_analysis_trace: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    resume_trace = _trace_payload(resume_analysis_trace or profile.get("lastResumeAnalysisTrace"))
    job_trace = _trace_payload(job_analysis_trace or profile.get("lastJobAnalysisTrace"))
    candidate_skills = candidate.get("skills") if isinstance(candidate.get("skills"), list) else []
    job_required_skills = job.get("requiredSkills") if isinstance(job.get("requiredSkills"), list) else []
    memory_keys = [
        key
        for key in ("skillProgress", "recurringGaps", "strongSkills", "behaviorProfile", "cultureFitSignals")
        if key in candidate_memory
    ]

    resume_sources: list[str] = []
    if str(resume_text or "").strip():
        resume_sources.append("resume_text")
    if str(profile.get("resumeSummary") or "").strip():
        resume_sources.append("profile.resumeSummary")
    if candidate_skills:
        resume_sources.append("candidate.skills")
    if resume_trace:
        resume_sources.append("profile.lastResumeAnalysisTrace")
    candidate_confidence = 0.25
    if resume_sources:
        candidate_confidence += 0.25
    if candidate_skills:
        candidate_confidence += 0.25
    if str(candidate.get("summary") or "").strip():
        candidate_confidence += 0.15
    candidate_trace_confidence = _clamp_confidence(resume_trace.get("confidence"))
    if candidate_trace_confidence is not None:
        candidate_confidence = candidate_trace_confidence

    job_sources: list[str] = []
    if str(job_description or "").strip():
        job_sources.append("job_description")
    if str(profile.get("jobDescription") or "").strip():
        job_sources.append("profile.jobDescription")
    if job_required_skills:
        job_sources.append("job.requiredSkills")
    if job_trace:
        job_sources.append("profile.lastJobAnalysisTrace")
    job_confidence = 0.25
    if job_sources:
        job_confidence += 0.25
    if job_required_skills:
        job_confidence += 0.3
    if str(job.get("roleTitleGuess") or "").strip():
        job_confidence += 0.1
    job_trace_confidence = _clamp_confidence(job_trace.get("confidence"))
    if job_trace_confidence is not None:
        job_confidence = job_trace_confidence

    match_evidence: list[str] = []
    if candidate_skills:
        match_evidence.append("candidate.skills")
    if job_required_skills:
        match_evidence.append("job.requiredSkills")
    if isinstance(match.get("interviewSignalSummary"), list) and match.get("interviewSignalSummary"):
        match_evidence.append("interview.signals")
    match_confidence = 0.2
    if candidate_skills and job_required_skills:
        match_confidence += 0.35
    if match.get("matchScore") is not None:
        match_confidence += 0.2
    if "interview.signals" in match_evidence:
        match_confidence += 0.15

    memory_status: AgentStatus = "completed" if candidate_memory else "skipped"
    memory_summary = None
    if candidate_memory:
        memory_summary = f"{len(memory_keys)} blocos de memoria disponiveis"

    return {
        "candidate_agent": build_agent_runtime_record(
            name="candidate_agent",
            source=_normalize_source(resume_trace.get("source"), "heuristic"),
            confidence=candidate_confidence,
            prompt_version=str(resume_trace.get("promptVersion") or "").strip() or None,
            ai_provider=str(resume_trace.get("aiProvider") or "").strip() or None,
            ai_model=str(resume_trace.get("aiModel") or "").strip() or None,
            evidence=resume_sources,
            summary="Extracao heuristica do perfil tecnico do candidato.",
        ),
        "job_agent": build_agent_runtime_record(
            name="job_agent",
            source=_normalize_source(job_trace.get("source"), "heuristic"),
            confidence=job_confidence,
            prompt_version=str(job_trace.get("promptVersion") or "").strip() or None,
            ai_provider=str(job_trace.get("aiProvider") or "").strip() or None,
            ai_model=str(job_trace.get("aiModel") or "").strip() or None,
            evidence=job_sources,
            summary="Leitura heuristica da vaga e dos focos de entrevista.",
        ),
        "match_agent": build_agent_runtime_record(
            name="match_agent",
            source="heuristic",
            confidence=match_confidence,
            evidence=match_evidence,
            summary="Comparacao deterministica entre skills do candidato e requisitos da vaga.",
        ),
        "candidate_memory": build_agent_runtime_record(
            name="candidate_memory",
            status=memory_status,
            source="system",
            confidence=1.0 if candidate_memory else 0.0,
            evidence=memory_keys,
            summary=memory_summary or "Sem memoria consolidada carregada para este contexto.",
        ),
    }
