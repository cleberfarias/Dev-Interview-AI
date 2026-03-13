from __future__ import annotations

import base64
import os

from fastapi import HTTPException

from .. import tts as tts_module
from ..ai.router import AIProviderError


def name_extract(payload, user):
    # Lazy import avoids circular dependency: interview_core imports this module.
    from . import interview_core

    cost = interview_core._credit_cost("CREDITS_NAME_EXTRACT", 1)
    if cost > 0:
        interview_core._ensure_credits(user["uid"], required=cost)

    audio_bytes = interview_core._b64_to_bytes(payload.audioBase64)
    prompt = (
        "Extraia apenas o primeiro nome da pessoa do audio. "
        f"Responda somente o nome (1 palavra). Idioma: {payload.uiLanguage}"
    )
    try:
        result = interview_core.ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=20,
            temperature=0.0,
            media=[{"data": audio_bytes, "mime_type": payload.mimeType}],
        )
    except AIProviderError as e:
        try:
            transcript = interview_core._openai_transcribe_audio(audio_bytes, payload.mimeType)
            prompt_txt = (
                f"Transcrição: {transcript}\n"
                "Extraia apenas o primeiro nome da pessoa. "
                f"Responda somente o nome (1 palavra). Idioma: {payload.uiLanguage}"
            )
            result = interview_core.ai_router.generate(
                task_name="evaluate",
                prompt=prompt_txt,
                max_tokens=20,
                temperature=0.0,
            )
        except Exception:
            interview_core._handle_ai_error(e)

    name = (result.output_text or "").strip().split()
    if cost > 0:
        interview_core._debit_credits(user["uid"], amount=cost)
    return {"name": name[0] if name else "Candidato"}


def tts(body: dict, user):
    # Lazy import avoids circular dependency: interview_core imports this module.
    from . import interview_core

    text = body.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")

    cost = interview_core._credit_cost("CREDITS_TTS", 1)
    if cost > 0:
        interview_core._ensure_credits(user["uid"], required=cost)

    language = body.get("language", "pt-BR")
    voice = body.get("voice")
    try:
        audio = tts_module.synthesize_text(text=text, language_code=language, voice_name=voice)
        b64 = base64.b64encode(audio).decode()
        fmt = (os.environ.get("OPENAI_TTS_FORMAT") or "mp3").lower().strip()
        if fmt in ("wav", "wave"):
            mime = "audio/wav"
        elif fmt in ("ogg", "opus"):
            mime = "audio/ogg"
        else:
            mime = "audio/mpeg"
        if cost > 0:
            interview_core._debit_credits(user["uid"], amount=cost)
        return {"audioBase64": b64, "mimeType": mime}
    except Exception:
        interview_core.logger.exception("TTS synth failed")
        raise HTTPException(status_code=503, detail="TTS service unavailable")
