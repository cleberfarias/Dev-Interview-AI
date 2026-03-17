from __future__ import annotations

from collections import Counter
from typing import Any

from ..schemas import BehaviorProfile, BehavioralSpeechSignals, CultureFitSignals, HiringCommunicationSignals

_COLLABORATION_TERMS = {
    "team",
    "equipe",
    "together",
    "junto",
    "stakeholder",
    "pair",
    "mentoria",
    "collaboration",
    "alinhamento",
}
_OWNERSHIP_TERMS = {
    "assumi",
    "own",
    "ownership",
    "responsavel",
    "responsibility",
    "resolvi",
    "corrigi",
    "lider",
    "liderei",
    "incidente",
    "entreguei",
}
_ADAPTABILITY_TERMS = {
    "adaptei",
    "adapt",
    "feedback",
    "aprendi",
    "learned",
    "iterei",
    "iterated",
    "mudei",
    "mudamos",
    "trade-off",
    "tradeoff",
    "ajustei",
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _clamp(value: float, min_value: float = 0.0, max_value: float = 10.0) -> float:
    return round(max(min_value, min(max_value, float(value))), 2)


def _normalize_communication_signals(value: HiringCommunicationSignals | dict[str, Any] | None) -> HiringCommunicationSignals:
    if isinstance(value, HiringCommunicationSignals):
        return value
    if isinstance(value, dict):
        return HiringCommunicationSignals(**value)
    return HiringCommunicationSignals()


def _normalize_behavioral_signals(value: BehavioralSpeechSignals | dict[str, Any] | None) -> BehavioralSpeechSignals:
    if isinstance(value, BehavioralSpeechSignals):
        return value
    if isinstance(value, dict):
        return BehavioralSpeechSignals(**value)
    return BehavioralSpeechSignals()


def _normalize_behavior_profile(value: BehaviorProfile | dict[str, Any] | None) -> BehaviorProfile | None:
    if isinstance(value, BehaviorProfile):
        return value
    if isinstance(value, dict):
        return BehaviorProfile(**value)
    return None


def _keyword_hits(text: str, vocabulary: set[str]) -> int:
    lowered = str(text or "").lower()
    return sum(1 for term in vocabulary if term in lowered)


def _job_soft_skill_bonus(job_context: dict[str, Any] | None, category: str) -> float:
    soft_skills = job_context.get("softSkills") if isinstance(job_context, dict) else []
    if not isinstance(soft_skills, list):
        return 0.0
    normalized = " ".join(str(item).lower() for item in soft_skills)
    if category == "collaboration" and any(term in normalized for term in ("team", "colabora", "stakeholder")):
        return 0.5
    if category == "ownership" and any(term in normalized for term in ("ownership", "proatividade", "lider")):
        return 0.5
    if category == "adaptability" and any(term in normalized for term in ("adapt", "flex", "mudanca", "aprend")):
        return 0.5
    return 0.0


def run(
    *,
    transcript: str,
    communication_signals: HiringCommunicationSignals | dict[str, Any] | None = None,
    behavioral_speech_signals: BehavioralSpeechSignals | dict[str, Any] | None = None,
    behavior_profile: BehaviorProfile | dict[str, Any] | None = None,
    evaluation: dict[str, Any] | None = None,
    job_context: dict[str, Any] | None = None,
    match_context: dict[str, Any] | None = None,
) -> CultureFitSignals:
    communication = _normalize_communication_signals(communication_signals)
    behavioral = _normalize_behavioral_signals(behavioral_speech_signals)
    profile = _normalize_behavior_profile(behavior_profile)
    criteria = (evaluation or {}).get("criteriaScores") if isinstance((evaluation or {}).get("criteriaScores"), dict) else {}
    text = str(transcript or "").strip()

    collaboration_hits = _keyword_hits(text, _COLLABORATION_TERMS)
    ownership_hits = _keyword_hits(text, _OWNERSHIP_TERMS)
    adaptability_hits = _keyword_hits(text, _ADAPTABILITY_TERMS)
    disc_conscientiousness = _safe_float(profile.discReadiness.conscientiousness if profile else 0.0, 0.0)

    collaboration = _clamp(
        5.1
        + (communication.professionalCommunication * 0.24)
        + (behavioral.consistency * 0.18)
        + min(1.4, collaboration_hits * 0.45)
        + _job_soft_skill_bonus(job_context, "collaboration")
    )
    ownership = _clamp(
        5.0
        + (behavioral.assertiveness * 0.20)
        + (communication.verbalObjectivity * 0.20)
        + (_safe_float(criteria.get("technicalPrecision"), 6.0) * 0.12)
        + min(1.5, ownership_hits * 0.5)
        + _job_soft_skill_bonus(job_context, "ownership")
    )
    adaptability = _clamp(
        5.0
        + (behavioral.spontaneity * 0.18)
        + (behavioral.emotionalControl * 0.18)
        + min(1.5, adaptability_hits * 0.5)
        + _job_soft_skill_bonus(job_context, "adaptability")
    )
    communication_fit = _clamp(
        (communication.responseClarity * 0.36)
        + (communication.professionalCommunication * 0.34)
        + (disc_conscientiousness * 0.30)
    )

    match_score = _safe_float((match_context or {}).get("matchScore"), 0.0) / 10.0
    overall_alignment = _clamp(
        (collaboration * 0.24)
        + (ownership * 0.28)
        + (adaptability * 0.22)
        + (communication_fit * 0.18)
        + (match_score * 0.08)
    )

    supporting_signals: list[str] = []
    if collaboration_hits:
        supporting_signals.append("citou colaboracao, alinhamento ou trabalho em equipe")
    if ownership_hits:
        supporting_signals.append("mostrou senso de ownership e responsabilidade")
    if adaptability_hits:
        supporting_signals.append("demonstrou adaptacao a mudancas e feedback")
    if communication.professionalCommunication >= 7.0:
        supporting_signals.append("mantem comunicacao profissional consistente")
    if not supporting_signals:
        supporting_signals.append("sinais ainda limitados; precisa de mais evidencia comportamental")

    summary = (
        "Sinais de culture fit sugerem "
        f"colaboracao {collaboration:.1f}, ownership {ownership:.1f} e adaptabilidade {adaptability:.1f}. "
        "Interprete como apoio a decisao, nao como veredito isolado."
    )

    return CultureFitSignals(
        collaboration=collaboration,
        ownership=ownership,
        adaptability=adaptability,
        communicationFit=communication_fit,
        overallAlignment=overall_alignment,
        supportingSignals=supporting_signals[:4],
        summary=summary,
    )


def aggregate_from_history(history: list[dict[str, Any]]) -> CultureFitSignals | None:
    analyses = [
        item.get("communicationAnalysis")
        for item in history
        if isinstance(item, dict) and isinstance(item.get("communicationAnalysis"), dict)
    ]
    signals = [
        signal
        for analysis in analyses
        for signal in [analysis.get("cultureFitSignals")]
        if isinstance(signal, dict)
    ]
    if not signals:
        return None

    def _avg(key: str) -> float:
        return _clamp(sum(_safe_float(item.get(key), 0.0) for item in signals) / max(1, len(signals)))

    supporting_counter = Counter()
    for signal in signals:
        raw = signal.get("supportingSignals") or []
        if isinstance(raw, list):
            supporting_counter.update(str(item).strip() for item in raw if str(item).strip())

    summary = (
        f"Culture fit agregado com alinhamento geral {_avg('overallAlignment'):.1f}, "
        f"baseado em {len(signals)} respostas observadas."
    )
    return CultureFitSignals(
        collaboration=_avg("collaboration"),
        ownership=_avg("ownership"),
        adaptability=_avg("adaptability"),
        communicationFit=_avg("communicationFit"),
        overallAlignment=_avg("overallAlignment"),
        supportingSignals=[item for item, _count in supporting_counter.most_common(4)],
        summary=summary,
    )
