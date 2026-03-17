from __future__ import annotations

import logging
from datetime import datetime, timezone
from time import perf_counter

from ..repositories import communication_analysis_log_repository
from ..live_coach.pipeline import process_live_audio_chunk
from ..schemas import LiveCoachProcessRequest, LiveCoachProcessResponse
from . import communication_analysis_service, partial_feedback_service

logger = logging.getLogger("uvicorn.error")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    raw = str(value or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def process_audio_chunk(payload: LiveCoachProcessRequest, user: dict | None = None) -> LiveCoachProcessResponse:
    started_at = perf_counter()
    audio_base64 = (payload.audioBase64 or "").strip()
    chunk_context: dict[str, object] = {}
    if payload.audioChunks:
        latest_chunk = payload.audioChunks[-1]
        if not audio_base64:
            audio_base64 = (latest_chunk.audio or "").strip()
        chunk_context = {
            "chunkId": latest_chunk.chunkId,
            "chunkIndex": int(latest_chunk.chunkIndex),
            "chunkTimestamp": latest_chunk.timestamp or latest_chunk.endedAt,
            "startedAt": latest_chunk.startedAt,
            "endedAt": latest_chunk.endedAt,
            "durationMs": latest_chunk.durationMs,
            "sessionId": latest_chunk.sessionId,
            "questionId": latest_chunk.questionId,
            "chunkCount": len(payload.audioChunks),
        }

    merged_context = dict(payload.context or {})
    if chunk_context:
        merged_context.update(chunk_context)

    result = process_live_audio_chunk(
        audio_base64,
        merged_context or None,
        mime_type=payload.mimeType or "audio/webm",
    )
    mode = str(merged_context.get("mode") or "candidate_coaching_mode").strip() or "candidate_coaching_mode"
    speech_metrics = communication_analysis_service.normalize_speech_metrics(merged_context.get("speechMetrics"))
    communication_signals = communication_analysis_service.derive_communication_signals(
        transcript=result.get("transcript") or "",
        speech_metrics=speech_metrics,
    )
    behavioral_speech_signals = communication_analysis_service.derive_behavioral_speech_signals(
        transcript=result.get("transcript") or "",
        speech_metrics=speech_metrics,
        communication_signals=communication_signals,
    )
    partial_feedback = partial_feedback_service.build_partial_feedback(
        transcript=result.get("transcript") or "",
        speech_metrics=speech_metrics,
        mode=mode,
        chunk_index=int(merged_context.get("chunkIndex") or 0),
        already_triggered=_as_bool(merged_context.get("partialFeedbackDelivered")),
        partial_feedback_enabled=_as_bool(merged_context.get("partialFeedbackEnabled"), default=True),
    )

    latency_ms = int((perf_counter() - started_at) * 1000)

    try:
        communication_analysis_log_repository.create_log(
            {
                "answerId": merged_context.get("answerId"),
                "sessionId": merged_context.get("sessionId"),
                "userId": (user or {}).get("uid"),
                "metricsGenerated": bool(speech_metrics),
                "partialFeedbackTriggered": bool(partial_feedback),
                "latencyMs": latency_ms,
                "mode": mode,
                "status": result.get("status"),
                "createdAt": _now_iso(),
            }
        )
    except Exception:
        logger.exception("Failed to persist communication_analysis_logs sessionId=%s", merged_context.get("sessionId"))

    enriched = dict(result)
    enriched["mode"] = mode
    enriched["partialFeedbackTriggered"] = bool(partial_feedback)
    enriched["partialFeedback"] = partial_feedback.model_dump() if partial_feedback else None
    enriched["speechMetrics"] = speech_metrics.model_dump() if speech_metrics else None
    enriched["communicationSignals"] = communication_signals.model_dump()
    enriched["behavioralSpeechSignals"] = behavioral_speech_signals.model_dump()
    return LiveCoachProcessResponse(**enriched)
