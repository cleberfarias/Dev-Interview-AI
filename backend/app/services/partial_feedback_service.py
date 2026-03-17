from __future__ import annotations

from ..schemas import PartialFeedback, SpeechMetrics


_TECHNICAL_KEYWORDS = {
    "api",
    "backend",
    "frontend",
    "database",
    "cache",
    "deploy",
    "monitoring",
    "observability",
    "scaling",
    "arquitetura",
    "banco",
    "fila",
    "sistema",
    "latencia",
    "performance",
    "teste",
    "cloud",
}


def _word_count(text: str) -> int:
    return len([word for word in str(text or "").strip().split() if word])


def _has_technical_content(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    return any(keyword in normalized for keyword in _TECHNICAL_KEYWORDS)


def build_partial_feedback(
    *,
    transcript: str,
    speech_metrics: SpeechMetrics | None,
    mode: str = "candidate_coaching_mode",
    chunk_index: int = 0,
    already_triggered: bool = False,
    partial_feedback_enabled: bool = True,
) -> PartialFeedback | None:
    if mode != "candidate_coaching_mode":
        return None
    if already_triggered or not partial_feedback_enabled:
        return None

    text = str(transcript or "").strip()
    words = _word_count(text)
    duration_ms = int(getattr(speech_metrics, "totalDurationMs", 0) or 0)
    hesitation_markers = list(getattr(speech_metrics, "hesitationMarkers", []) or [])
    filler_count = int(getattr(speech_metrics, "fillerCount", 0) or 0)
    long_pause_count = int(getattr(speech_metrics, "longPauseCount", 0) or 0)

    if chunk_index < 2 and words < 18 and duration_ms < 4500:
        return None

    if filler_count >= 4 or long_pause_count >= 2 or len(hesitation_markers) >= 2:
        return PartialFeedback(message="Respire e siga com mais firmeza. Foque em uma linha de raciocinio com exemplo concreto.")

    if duration_ms >= 6000 and words < 12:
        return PartialFeedback(message="Sua resposta ainda esta curta. Tente explicar contexto, acao e resultado.")

    if duration_ms >= 7000 and words >= 18 and not _has_technical_content(text):
        return PartialFeedback(message="A resposta esta ficando vaga. Traga uma decisao tecnica ou um exemplo pratico da sua experiencia.")

    if words >= 24 and duration_ms >= 7000 and _has_technical_content(text):
        return PartialFeedback(message="Bom caminho. Agora conecte a resposta a impacto, metricao ou resultado real.")

    return None
