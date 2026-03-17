from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

from .. import tts as legacy_tts


def _normalize_provider_name(raw: str | None) -> str | None:
    value = str(raw or "").strip().lower()
    if not value:
        return None
    if value in {"eleven", "11labs", "eleven_labs"}:
        return "elevenlabs"
    if value in {"azure-speech", "microsoft", "azure_tts"}:
        return "azure"
    if value in {"google", "openai", "elevenlabs", "azure"}:
        return value
    return None


def _provider_name(provider: str | None = None) -> str:
    explicit = _normalize_provider_name(provider)
    if explicit:
        return explicit

    avatar_provider = _normalize_provider_name(os.environ.get("AVATAR_TTS_PROVIDER"))
    if avatar_provider:
        return avatar_provider

    # Prefer ElevenLabs for the avatar when its credentials are available,
    # without changing the generic /ai/tts provider for the rest of the app.
    if str(os.environ.get("ELEVENLABS_API_KEY") or "").strip():
        return "elevenlabs"

    return _normalize_provider_name(os.environ.get("TTS_PROVIDER")) or "openai"


def _synthesize_openai(text: str, language: str, voice: str | None) -> bytes:
    return legacy_tts._synthesize_openai(text=text, language_code=language, voice_name=voice)  # type: ignore[attr-defined]


def _synthesize_google(text: str, language: str, voice: str | None) -> bytes:
    return legacy_tts._synthesize_google(text=text, language_code=language, voice_name=voice)  # type: ignore[attr-defined]


def _synthesize_elevenlabs(text: str, voice: str | None) -> bytes:
    api_key = str(os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")

    voice_id = str(voice or os.environ.get("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL").strip()
    model_id = str(os.environ.get("ELEVENLABS_MODEL_ID") or "eleven_multilingual_v2").strip()
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    body = json.dumps(
        {
            "text": text,
            "model_id": model_id,
            "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=35) as resp:
        return resp.read()


def _synthesize_azure(text: str, language: str, voice: str | None) -> bytes:
    key = str(os.environ.get("AZURE_SPEECH_KEY") or "").strip()
    region = str(os.environ.get("AZURE_SPEECH_REGION") or "").strip()
    if not key or not region:
        raise RuntimeError("Azure Speech credentials not configured")

    voice_name = str(voice or os.environ.get("AZURE_SPEECH_VOICE") or "pt-BR-FranciscaNeural").strip()
    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = (
        "<speak version='1.0' xml:lang='en-US'>"
        f"<voice name='{voice_name}'>"
        f"{text}"
        "</voice></speak>"
    ).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=ssml,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "dev-interview-ai-avatar",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=35) as resp:
        return resp.read()


def _encode_audio(audio_bytes: bytes) -> str:
    return base64.b64encode(audio_bytes).decode("ascii")


def generate_voice(text: str) -> str:
    payload = generate_voice_payload(text=text)
    return str(payload.get("audioBase64") or "")


def generate_voice_payload(
    *,
    text: str,
    language: str = "pt-BR",
    voice: str | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    content = str(text or "").strip()
    if not content:
        return {"audioBase64": "", "mimeType": "audio/mpeg", "provider": "none"}

    selected = _provider_name(provider)
    chain = [selected, "openai", "google"]
    if "elevenlabs" not in chain:
        chain.append("elevenlabs")
    if "azure" not in chain:
        chain.append("azure")

    last_error: Exception | None = None
    for candidate in chain:
        try:
            if candidate == "openai":
                audio = _synthesize_openai(content, language, voice)
            elif candidate == "google":
                audio = _synthesize_google(content, language, voice)
            elif candidate == "elevenlabs":
                audio = _synthesize_elevenlabs(content, voice)
            elif candidate == "azure":
                audio = _synthesize_azure(content, language, voice)
            else:
                continue
            if not audio:
                continue
            return {
                "audioBase64": _encode_audio(audio),
                "mimeType": "audio/mpeg",
                "provider": candidate,
            }
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, Exception) as exc:
            last_error = exc
            continue

    if last_error:
        raise RuntimeError(f"Avatar TTS unavailable: {last_error}") from last_error
    raise RuntimeError("Avatar TTS unavailable")
