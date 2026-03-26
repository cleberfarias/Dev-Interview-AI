import base64
from types import SimpleNamespace

import pytest

from app.ai.router import AIProviderError, AIRouter


def _fake_response(content: str, total_tokens: int = 0):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(total_tokens=total_tokens),
    )


def test_generate_uses_litellm_for_json_mode(monkeypatch):
    calls = []
    logs = []

    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key-1234567890")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("AI_PROVIDER_ORDER", "openai")
    monkeypatch.setenv("AI_MODEL_PLAN", "openai:gpt-test")
    monkeypatch.setattr(
        "app.ai.router.ai_observability_service.log_execution",
        lambda **kwargs: logs.append(kwargs),
    )

    def fake_completion(**kwargs):
        calls.append(kwargs)
        return _fake_response('{"ok":true}', total_tokens=31)

    monkeypatch.setattr("app.ai.router.litellm.completion", fake_completion)

    router = AIRouter()
    result = router.generate(
        task_name="plan",
        prompt="Responda em JSON.",
        max_tokens=120,
        temperature=0.2,
        response_mime_type="application/json",
        metadata={"traceId": "trace-1"},
    )

    assert result.output_text == '{"ok":true}'
    assert result.provider_used == "openai"
    assert result.model_used == "gpt-test"
    assert result.tokens_used == 31

    assert calls[0]["model"] == "openai/gpt-test"
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert calls[0]["messages"] == [{"role": "user", "content": "Responda em JSON."}]
    assert logs[-1]["status"] == "success"
    assert logs[-1]["provider"] == "openai"
    assert logs[-1]["model"] == "gpt-test"


def test_generate_builds_multimodal_audio_messages(monkeypatch):
    calls = []

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key-1234567890")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("AI_PROVIDER_ORDER_MEDIA", "gemini")
    monkeypatch.setenv("AI_MODEL_FAST", "gemini:gemini-test")
    monkeypatch.setattr(
        "app.ai.router.ai_observability_service.log_execution",
        lambda **kwargs: None,
    )

    def fake_completion(**kwargs):
        calls.append(kwargs)
        return _fake_response("transcribed")

    monkeypatch.setattr("app.ai.router.litellm.completion", fake_completion)

    router = AIRouter()
    router.generate(
        task_name="evaluate",
        prompt="Analise este audio.",
        max_tokens=80,
        temperature=0.0,
        media=[{"data": b"audio-bytes", "mime_type": "audio/webm;codecs=opus"}],
    )

    content = calls[0]["messages"][0]["content"]
    assert calls[0]["model"] == "gemini/gemini-test"
    assert content[0] == {"type": "text", "text": "Analise este audio."}
    assert content[1] == {
        "type": "input_audio",
        "input_audio": {
            "data": base64.b64encode(b"audio-bytes").decode("ascii"),
            "format": "webm",
        },
    }


def test_generate_falls_back_on_retryable_provider_error(monkeypatch):
    calls = []
    logs = []

    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key-1234567890")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key-1234567890")
    monkeypatch.setenv("AI_PROVIDER_ORDER", "openai,groq")
    monkeypatch.setenv("AI_MODEL_PLAN", "openai:primary-model")
    monkeypatch.setenv("AI_MODEL_FALLBACK_GROQ", "groq:backup-model")
    monkeypatch.setattr(
        "app.ai.router.ai_observability_service.log_execution",
        lambda **kwargs: logs.append(kwargs),
    )

    def fake_completion(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise AIProviderError("rate limited", status_code=429, retry_after=15, retryable=True)
        return _fake_response("ok from backup", total_tokens=22)

    monkeypatch.setattr("app.ai.router.litellm.completion", fake_completion)

    router = AIRouter()
    result = router.generate(
        task_name="plan",
        prompt="Responda apenas OK.",
        max_tokens=20,
        temperature=0.0,
    )

    assert result.output_text == "ok from backup"
    assert result.provider_used == "groq"
    assert result.model_used == "backup-model"
    assert [call["model"] for call in calls] == ["openai/primary-model", "groq/backup-model"]
    assert [entry["status"] for entry in logs[-2:]] == ["error", "success"]
    assert logs[-2]["provider"] == "openai"
    assert logs[-1]["provider"] == "groq"


def test_generate_raises_when_no_provider_is_configured(monkeypatch):
    logs = []

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(
        "app.ai.router.ai_observability_service.log_execution",
        lambda **kwargs: logs.append(kwargs),
    )

    router = AIRouter()

    with pytest.raises(AIProviderError) as exc_info:
        router.generate(
            task_name="plan",
            prompt="Teste",
            max_tokens=10,
            temperature=0.0,
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.retryable is False
    assert logs[-1]["status"] == "error"
    assert logs[-1]["error_message"] == "AI not configured"
