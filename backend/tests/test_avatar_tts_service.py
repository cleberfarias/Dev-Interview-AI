from app.avatar_engine import tts_service


def test_provider_name_prefers_avatar_specific_provider(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "openai")
    monkeypatch.setenv("AVATAR_TTS_PROVIDER", "elevenlabs")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    assert tts_service._provider_name() == "elevenlabs"


def test_provider_name_prefers_elevenlabs_when_key_is_present(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "openai")
    monkeypatch.delenv("AVATAR_TTS_PROVIDER", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-elevenlabs-key")

    assert tts_service._provider_name() == "elevenlabs"


def test_generate_voice_payload_uses_elevenlabs_for_avatar(monkeypatch):
    monkeypatch.setenv("AVATAR_TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-elevenlabs-key")
    monkeypatch.setattr(tts_service, "_synthesize_elevenlabs", lambda text, voice: b"avatar-audio")

    payload = tts_service.generate_voice_payload(text="Ola, vamos comecar a entrevista.", language="pt-BR")

    assert payload["provider"] == "elevenlabs"
    assert payload["mimeType"] == "audio/mpeg"
    assert payload["audioBase64"] == "YXZhdGFyLWF1ZGlv"
