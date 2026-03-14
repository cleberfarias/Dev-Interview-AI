from __future__ import annotations

import logging
from typing import Any

from . import avatar_renderer, emotion_service, lipsync_service, tts_service

logger = logging.getLogger("uvicorn.error")


def generate_avatar_response(
    text: str,
    emotion: str | None = "neutral",
    language: str = "pt-BR",
    voice: str | None = None,
) -> dict[str, Any]:
    content = str(text or "").strip()
    resolved_emotion = str(emotion or "").strip().lower() or emotion_service.detect_emotion(content)
    if not resolved_emotion:
        resolved_emotion = "neutral"

    try:
        voice_payload = tts_service.generate_voice_payload(
            text=content,
            language=language,
            voice=voice,
        )
        audio_base64 = str(voice_payload.get("audioBase64") or "")
        mime_type = str(voice_payload.get("mimeType") or "audio/mpeg")
        provider = str(voice_payload.get("provider") or "fallback")
    except Exception:
        logger.exception("Avatar TTS generation failed")
        audio_base64 = ""
        mime_type = "audio/mpeg"
        provider = "fallback"

    lipsync = lipsync_service.generate(audio_base64, text=content) if audio_base64 else {"frames": [], "durationMs": 0}
    render = avatar_renderer.build_render_payload(emotion=resolved_emotion, lipsync=lipsync)

    return {
        "audio": audio_base64,
        "mimeType": mime_type,
        "lipsync": lipsync,
        "emotion": resolved_emotion,
        "ttsProvider": provider,
        "render": render,
    }
