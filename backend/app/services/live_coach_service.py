from __future__ import annotations

from ..live_coach.pipeline import process_live_audio_chunk
from ..schemas import LiveCoachProcessRequest, LiveCoachProcessResponse


def process_audio_chunk(payload: LiveCoachProcessRequest, user: dict | None = None) -> LiveCoachProcessResponse:
    result = process_live_audio_chunk(
        payload.audioBase64,
        payload.context or None,
        mime_type=payload.mimeType or "audio/webm",
    )
    return LiveCoachProcessResponse(**result)
