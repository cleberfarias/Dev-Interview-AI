from __future__ import annotations

from collections import Counter
from typing import Any

from ..schemas import BehaviorProfile, BehavioralSpeechSignals, DiscReadinessSignals, HiringCommunicationSignals


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


def _top_traits(*, communication: HiringCommunicationSignals, behavioral: BehavioralSpeechSignals) -> list[str]:
    traits: list[str] = []
    if behavioral.assertiveness >= 7.0:
        traits.append("assertividade")
    if behavioral.consistency >= 7.0:
        traits.append("consistencia")
    if communication.verbalObjectivity >= 7.0:
        traits.append("objetividade")
    if behavioral.spontaneity >= 7.0:
        traits.append("espontaneidade")
    if behavioral.cautionLevel >= 6.5:
        traits.append("cautela")
    if behavioral.emotionalControl >= 7.0:
        traits.append("controle emocional")
    return traits[:4] or ["equilibrio comunicacional"]


def _communication_style(*, disc: DiscReadinessSignals, behavioral: BehavioralSpeechSignals) -> str:
    if disc.conscientiousness >= 7.2 and disc.dominance >= 6.4:
        return "analitico-direto"
    if disc.influence >= 7.0 and disc.steadiness >= 6.4:
        return "colaborativo-engajador"
    if behavioral.cautionLevel >= 6.8 or disc.steadiness >= 7.0:
        return "estruturado-reflexivo"
    return "equilibrado-profissional"


def run(
    *,
    transcript: str,
    communication_signals: HiringCommunicationSignals | dict[str, Any] | None = None,
    behavioral_speech_signals: BehavioralSpeechSignals | dict[str, Any] | None = None,
    evaluation: dict[str, Any] | None = None,
) -> BehaviorProfile:
    del transcript, evaluation
    communication = _normalize_communication_signals(communication_signals)
    behavioral = _normalize_behavioral_signals(behavioral_speech_signals)

    disc = DiscReadinessSignals(
        dominance=_clamp(
            (behavioral.assertiveness * 0.46)
            + (communication.responseConfidence * 0.34)
            + ((10.0 - behavioral.cautionLevel) * 0.20)
        ),
        influence=_clamp(
            (behavioral.spontaneity * 0.45)
            + (communication.professionalCommunication * 0.30)
            + (communication.responseConfidence * 0.25)
        ),
        steadiness=_clamp(
            (behavioral.consistency * 0.40)
            + (behavioral.emotionalControl * 0.35)
            + (behavioral.cautionLevel * 0.25)
        ),
        conscientiousness=_clamp(
            (communication.verbalObjectivity * 0.34)
            + (communication.responseClarity * 0.34)
            + (behavioral.consistency * 0.32)
        ),
    )

    observed_traits = _top_traits(communication=communication, behavioral=behavioral)
    communication_style = _communication_style(disc=disc, behavioral=behavioral)
    summary = (
        f"Perfil {communication_style}, com destaque para {', '.join(observed_traits[:2])}. "
        "Use como indicio operacional de estilo de resposta, nao como diagnostico."
    )

    return BehaviorProfile(
        communicationStyle=communication_style,
        observedTraits=observed_traits,
        summary=summary,
        discReadiness=disc,
    )


def aggregate_from_history(history: list[dict[str, Any]]) -> BehaviorProfile | None:
    analyses = [
        item.get("communicationAnalysis")
        for item in history
        if isinstance(item, dict) and isinstance(item.get("communicationAnalysis"), dict)
    ]
    profiles = [
        profile
        for analysis in analyses
        for profile in [analysis.get("behaviorProfile")]
        if isinstance(profile, dict)
    ]
    if not profiles:
        return None

    styles = Counter(
        str(profile.get("communicationStyle") or "").strip()
        for profile in profiles
        if str(profile.get("communicationStyle") or "").strip()
    )
    traits_counter = Counter()
    for profile in profiles:
        traits = profile.get("observedTraits") or []
        if isinstance(traits, list):
            traits_counter.update(str(item).strip() for item in traits if str(item).strip())

    disc_entries = [profile.get("discReadiness") for profile in profiles if isinstance(profile.get("discReadiness"), dict)]
    if not disc_entries:
        return None

    def _avg(key: str) -> float:
        values = [_safe_float(entry.get(key), 0.0) for entry in disc_entries]
        return _clamp(sum(values) / max(1, len(values)))

    disc = DiscReadinessSignals(
        dominance=_avg("dominance"),
        influence=_avg("influence"),
        steadiness=_avg("steadiness"),
        conscientiousness=_avg("conscientiousness"),
    )
    communication_style = styles.most_common(1)[0][0] if styles else "equilibrado-profissional"
    observed_traits = [item for item, _count in traits_counter.most_common(4)] or ["equilibrio comunicacional"]
    summary = (
        f"Perfil agregado {communication_style}, recorrente em {len(profiles)} respostas, "
        f"com maior presenca de {', '.join(observed_traits[:2])}."
    )

    return BehaviorProfile(
        communicationStyle=communication_style,
        observedTraits=observed_traits,
        summary=summary,
        discReadiness=disc,
    )
