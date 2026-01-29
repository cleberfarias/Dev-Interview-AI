import os
import json
from typing import Optional
import urllib.request
import urllib.error

from google.cloud import texttospeech


def _synthesize_google(text: str, language_code: str = "pt-BR", voice_name: Optional[str] = None, ssml_gender: str = "FEMALE") -> bytes:
    """Synthesize text using Google Cloud Text-to-Speech and return MP3 bytes."""
    client = texttospeech.TextToSpeechClient()

    voice = texttospeech.VoiceSelectionParams(
        language_code=language_code,
        ssml_gender=getattr(texttospeech.SsmlVoiceGender, ssml_gender.upper(), texttospeech.SsmlVoiceGender.FEMALE),
    )
    if voice_name:
        voice.name = voice_name

    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
    synthesis_input = texttospeech.SynthesisInput(text=text)
    response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
    return response.audio_content


def _synthesize_openai(text: str, language_code: str = "pt-BR", voice_name: Optional[str] = None) -> bytes:
    """Synthesize text using OpenAI Audio API and return audio bytes."""
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY nao configurada")

    model = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts").strip()
    voice = (voice_name or os.environ.get("OPENAI_TTS_VOICE", "coral")).strip()
    response_format = os.environ.get("OPENAI_TTS_FORMAT", "mp3").strip()
    instructions = os.environ.get("OPENAI_TTS_INSTRUCTIONS")

    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
    }
    if instructions:
        payload["instructions"] = instructions

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI TTS error: {e.code} {body}") from e


def synthesize_text(text: str, language_code: str = "pt-BR", voice_name: Optional[str] = None, ssml_gender: str = "FEMALE") -> bytes:
    """Synthesize text using configured provider and return audio bytes."""
    provider = (os.environ.get("TTS_PROVIDER") or "google").strip().lower()
    fallback = (os.environ.get("TTS_FALLBACK") or "").strip().lower()

    if provider == "openai":
        try:
            return _synthesize_openai(text=text, language_code=language_code, voice_name=voice_name)
        except Exception:
            if fallback == "google":
                return _synthesize_google(text=text, language_code=language_code, voice_name=voice_name, ssml_gender=ssml_gender)
            raise

    return _synthesize_google(text=text, language_code=language_code, voice_name=voice_name, ssml_gender=ssml_gender)
