from __future__ import annotations

from typing import Any

from ..schemas import (
    BehavioralSpeechSignals,
    CommunicationScore,
    HiringCommunicationSignals,
    SpeechMetrics,
)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _clamp(value: float, min_value: float = 0.0, max_value: float = 10.0) -> float:
    return round(max(min_value, min(max_value, float(value))), 2)


def _word_count(text: str) -> int:
    return len([word for word in str(text or "").strip().split() if word])


def normalize_speech_metrics(payload: Any) -> SpeechMetrics | None:
    if payload is None:
        return None
    if isinstance(payload, SpeechMetrics):
        return payload
    if isinstance(payload, dict):
        answer_id = str(payload.get("answerId") or "").strip()
        if not answer_id:
            return None
        return SpeechMetrics(**payload)
    return None


def derive_communication_signals(
    *,
    transcript: str,
    speech_metrics: SpeechMetrics | None = None,
) -> HiringCommunicationSignals:
    metrics = speech_metrics
    words = _word_count(transcript)
    fluency = _safe_float(getattr(metrics, "fluencyScore", None), default=6.0)
    wpm = _safe_float(getattr(metrics, "wordsPerMinute", None), default=120.0)
    filler_count = _safe_int(getattr(metrics, "fillerCount", None), default=0)
    pause_count = _safe_int(getattr(metrics, "pauseCount", None), default=0)
    long_pause_count = _safe_int(getattr(metrics, "longPauseCount", None), default=0)
    silence_ms = _safe_int(getattr(metrics, "silenceDurationMs", None), default=0)
    total_duration_ms = max(_safe_int(getattr(metrics, "totalDurationMs", None), default=0), 1)
    start_delay_ms = _safe_int(getattr(metrics, "timeToFirstSpeechMs", None), default=0)

    hesitation_ratio = min(
        1.0,
        (filler_count * 0.08)
        + (long_pause_count * 0.14)
        + min(0.35, silence_ms / total_duration_ms)
        + min(0.25, start_delay_ms / 6000.0),
    )

    response_clarity = 5.2 + (fluency * 0.28) + min(1.4, words / 28.0) - (filler_count * 0.18) - (pause_count * 0.06)
    response_confidence = 5.4 + (fluency * 0.26) - (hesitation_ratio * 2.6) - min(0.6, start_delay_ms / 6500.0)
    verbal_objectivity = 5.4 + min(1.4, words / 24.0) - min(1.5, filler_count * 0.2) - min(1.0, long_pause_count * 0.18)

    if wpm:
        if 105 <= wpm <= 165:
            response_clarity += 0.6
            verbal_objectivity += 0.3
        elif wpm < 75 or wpm > 190:
            response_clarity -= 0.7
            verbal_objectivity -= 0.4

    professional_communication = (
        response_clarity * 0.32
        + response_confidence * 0.24
        + verbal_objectivity * 0.24
        + fluency * 0.20
    )

    return HiringCommunicationSignals(
        responseClarity=_clamp(response_clarity),
        responseConfidence=_clamp(response_confidence),
        hesitationLevel=round(max(0.0, min(1.0, hesitation_ratio)), 3),
        verbalObjectivity=_clamp(verbal_objectivity),
        professionalCommunication=_clamp(professional_communication),
    )


def derive_behavioral_speech_signals(
    *,
    transcript: str,
    speech_metrics: SpeechMetrics | None = None,
    communication_signals: HiringCommunicationSignals | None = None,
) -> BehavioralSpeechSignals:
    metrics = speech_metrics
    signals = communication_signals or derive_communication_signals(transcript=transcript, speech_metrics=metrics)
    fluency = _safe_float(getattr(metrics, "fluencyScore", None), default=6.0)
    start_delay_ms = _safe_int(getattr(metrics, "timeToFirstSpeechMs", None), default=0)
    wpm = _safe_float(getattr(metrics, "wordsPerMinute", None), default=120.0)
    long_pause_count = _safe_int(getattr(metrics, "longPauseCount", None), default=0)

    assertiveness = signals.responseConfidence * 0.5 + signals.verbalObjectivity * 0.2 + fluency * 0.3
    assertiveness -= min(1.2, start_delay_ms / 4500.0)

    caution_level = 4.0 + (signals.hesitationLevel * 5.0) + min(1.0, long_pause_count * 0.22)
    spontaneity = 4.8 + min(1.7, wpm / 95.0) - min(1.2, start_delay_ms / 3500.0)
    consistency = signals.responseClarity * 0.44 + fluency * 0.36 + signals.verbalObjectivity * 0.2
    emotional_control = 5.4 + fluency * 0.22 - min(1.2, signals.hesitationLevel * 2.6)

    return BehavioralSpeechSignals(
        assertiveness=_clamp(assertiveness),
        cautionLevel=_clamp(caution_level),
        spontaneity=_clamp(spontaneity),
        consistency=_clamp(consistency),
        emotionalControl=_clamp(emotional_control),
    )


def build_communication_score(history: list[dict[str, Any]], report_data: dict[str, Any]) -> CommunicationScore:
    criteria_summary = report_data.get("criteriaSummary") or {}
    analyses = [
        item.get("communicationAnalysis")
        for item in history
        if isinstance(item, dict) and isinstance(item.get("communicationAnalysis"), dict)
    ]
    communication_signals = [
        item.get("communicationSignals")
        for item in analyses
        if isinstance(item, dict) and isinstance(item.get("communicationSignals"), dict)
    ]
    speech_metrics = [
        item.get("speechMetrics")
        for item in analyses
        if isinstance(item, dict) and isinstance(item.get("speechMetrics"), dict)
    ]

    avg_clarity_signal = (
        sum(_safe_float(item.get("responseClarity"), 0.0) for item in communication_signals) / len(communication_signals)
        if communication_signals
        else 0.0
    )
    avg_confidence_signal = (
        sum(_safe_float(item.get("responseConfidence"), 0.0) for item in communication_signals) / len(communication_signals)
        if communication_signals
        else 0.0
    )
    avg_objectivity_signal = (
        sum(_safe_float(item.get("verbalObjectivity"), 0.0) for item in communication_signals) / len(communication_signals)
        if communication_signals
        else 0.0
    )
    avg_prof_signal = (
        sum(_safe_float(item.get("professionalCommunication"), 0.0) for item in communication_signals) / len(communication_signals)
        if communication_signals
        else 0.0
    )
    avg_fluency_metric = (
        sum(_safe_float(item.get("fluencyScore"), 0.0) for item in speech_metrics) / len(speech_metrics)
        if speech_metrics
        else 0.0
    )

    clarity = _clamp(
        (_safe_float(criteria_summary.get("clarity"), 0.0) * 0.55)
        + (avg_clarity_signal * 0.45)
        or _safe_float(criteria_summary.get("clarity"), avg_clarity_signal),
    )
    structure = _clamp(
        (_safe_float(criteria_summary.get("structure"), 0.0) * 0.7)
        + (avg_objectivity_signal * 0.3)
        or _safe_float(criteria_summary.get("structure"), avg_objectivity_signal),
    )
    fluency = _clamp(avg_fluency_metric or _safe_float(criteria_summary.get("communication"), 0.0))
    confidence = _clamp((avg_confidence_signal * 0.7) + (_safe_float(criteria_summary.get("communication"), 0.0) * 0.3))
    conciseness = _clamp((avg_objectivity_signal * 0.8) + (avg_prof_signal * 0.2))
    overall = _clamp((clarity + structure + fluency + confidence + conciseness) / 5.0)

    return CommunicationScore(
        clarity=clarity,
        fluency=fluency,
        confidence=confidence,
        conciseness=conciseness,
        structure=structure,
        overall=overall,
    )


def build_communication_feedback(
    communication_score: CommunicationScore,
    communication_signals: HiringCommunicationSignals | None = None,
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    improvements: list[str] = []

    if communication_score.clarity >= 7.5:
        strengths.append("Comunicacao clara, com boa progressao de ideias.")
    if communication_score.fluency >= 7.0:
        strengths.append("Ritmo de fala fluido e com poucas interrupcoes.")
    if communication_score.confidence >= 7.0:
        strengths.append("Transmitiu confianca verbal durante a resposta.")

    hesitation_level = _safe_float(getattr(communication_signals, "hesitationLevel", None), default=0.0)
    if hesitation_level >= 0.45:
        improvements.append("Reduza hesitacoes e fillers para transmitir mais seguranca.")
    if communication_score.conciseness < 6.5:
        improvements.append("Traga respostas mais objetivas, com exemplo e resultado em menos voltas.")
    if communication_score.structure < 6.5:
        improvements.append("Organize a resposta em contexto, acao e impacto para ganhar consistencia.")

    if not strengths:
        strengths.append("Manteve consistencia minima de comunicacao ao longo da entrevista.")
    if not improvements:
        improvements.append("Refine exemplos concretos para elevar clareza e objetividade.")

    return strengths[:3], improvements[:3]


def aggregate_signals_from_history(
    history: list[dict[str, Any]],
) -> tuple[HiringCommunicationSignals | None, BehavioralSpeechSignals | None]:
    analyses = [
        item.get("communicationAnalysis")
        for item in history
        if isinstance(item, dict) and isinstance(item.get("communicationAnalysis"), dict)
    ]
    communication_signals = [
        item.get("communicationSignals")
        for item in analyses
        if isinstance(item, dict) and isinstance(item.get("communicationSignals"), dict)
    ]
    behavioral_signals = [
        item.get("behavioralSpeechSignals")
        for item in analyses
        if isinstance(item, dict) and isinstance(item.get("behavioralSpeechSignals"), dict)
    ]

    aggregated_communication = None
    if communication_signals:
        aggregated_communication = HiringCommunicationSignals(
            responseClarity=_clamp(
                sum(_safe_float(item.get("responseClarity"), 0.0) for item in communication_signals)
                / len(communication_signals)
            ),
            responseConfidence=_clamp(
                sum(_safe_float(item.get("responseConfidence"), 0.0) for item in communication_signals)
                / len(communication_signals)
            ),
            hesitationLevel=round(
                max(
                    0.0,
                    min(
                        1.0,
                        sum(_safe_float(item.get("hesitationLevel"), 0.0) for item in communication_signals)
                        / len(communication_signals),
                    ),
                ),
                3,
            ),
            verbalObjectivity=_clamp(
                sum(_safe_float(item.get("verbalObjectivity"), 0.0) for item in communication_signals)
                / len(communication_signals)
            ),
            professionalCommunication=_clamp(
                sum(_safe_float(item.get("professionalCommunication"), 0.0) for item in communication_signals)
                / len(communication_signals)
            ),
        )

    aggregated_behavioral = None
    if behavioral_signals:
        aggregated_behavioral = BehavioralSpeechSignals(
            assertiveness=_clamp(
                sum(_safe_float(item.get("assertiveness"), 0.0) for item in behavioral_signals) / len(behavioral_signals)
            ),
            cautionLevel=_clamp(
                sum(_safe_float(item.get("cautionLevel"), 0.0) for item in behavioral_signals) / len(behavioral_signals)
            ),
            spontaneity=_clamp(
                sum(_safe_float(item.get("spontaneity"), 0.0) for item in behavioral_signals) / len(behavioral_signals)
            ),
            consistency=_clamp(
                sum(_safe_float(item.get("consistency"), 0.0) for item in behavioral_signals) / len(behavioral_signals)
            ),
            emotionalControl=_clamp(
                sum(_safe_float(item.get("emotionalControl"), 0.0) for item in behavioral_signals)
                / len(behavioral_signals)
            ),
        )

    return aggregated_communication, aggregated_behavioral
