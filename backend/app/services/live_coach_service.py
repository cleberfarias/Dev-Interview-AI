from __future__ import annotations

from ..live_coach.pipeline import process_live_audio_chunk
from ..schemas import LiveCoachProcessRequest, LiveCoachProcessResponse


def process_audio_chunk(payload: LiveCoachProcessRequest, user: dict | None = None) -> LiveCoachProcessResponse:
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
    return LiveCoachProcessResponse(**result)
