import base64
import json

from fastapi.testclient import TestClient

from app.main import app
from app.ai.router import AIResult
from app.firebase_admin import get_current_user


def test_evaluate_audio_happy_path(monkeypatch):
    # Override auth dependency
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
    }

    # Avoid Firestore access
    monkeypatch.setattr('app.main._get_user_credits', lambda uid: 1)
    monkeypatch.setattr('app.main._debit_credits', lambda uid, amount=1: 0)

    payload = {
        "transcript": "Resposta de teste",
        "scores": {
            "communication": 7,
            "technical": 6,
            "problemSolving": 5,
            "presence": 8,
        },
        "strengths": ["clareza"],
        "improvements": ["mais detalhes"],
        "followUpNeeded": False,
        "followUpQuestion": None,
    }

    def fake_generate(*args, **kwargs):
        return AIResult(
            output_text=json.dumps(payload),
            provider_used="test",
            model_used="test-model",
            latency_ms=5,
            tokens_used=10,
        )

    monkeypatch.setattr('app.main.ai_router.generate', fake_generate)

    try:
        client = TestClient(app)
        audio_b64 = base64.b64encode(b'test-audio').decode('utf-8')
        body = {
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "backend",
                "seniority": "mid",
                "stacks": ["python"],
                "style": "friendly",
                "duration": 20,
                "plan": "free",
                "jobDescription": None,
            },
            "question": "Explique o que e uma API.",
            "audioBase64": audio_b64,
            "mimeType": "audio/webm",
            "confirmedName": "Ana",
        }

        resp = client.post('/ai/evaluate-audio', json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["transcript"] == "Resposta de teste"
        assert data["scores"]["communication"] == 7
        assert data["followUpNeeded"] is False
    finally:
        app.dependency_overrides = {}
