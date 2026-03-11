import json

from fastapi.testclient import TestClient

from app.ai.router import AIResult
from app.firebase_admin import get_current_user
from app.main import app


def test_evaluate_text_happy_path(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
    }

    monkeypatch.setattr("app.main._get_user_credits", lambda uid: 1)
    monkeypatch.setattr("app.main._debit_credits", lambda uid, amount=1: 0)

    payload = {
        "transcript": "Resposta em texto de teste.",
        "scores": {
            "communication": 8,
            "technical": 7,
            "problemSolving": 7,
            "presence": 7,
        },
        "strengths": ["clareza"],
        "improvements": ["detalhar trade-offs"],
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

    monkeypatch.setattr("app.main.ai_router.generate", fake_generate)

    try:
        client = TestClient(app)
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
            "question": "Explique um cache distribuido.",
            "transcript": "Eu usaria Redis para cache distribuido com TTL e invalidacao por eventos.",
            "confirmedName": "Ana",
        }
        resp = client.post("/ai/evaluate-text", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["transcript"] == "Resposta em texto de teste."
        assert data["scores"]["technical"] == 7
        assert data["followUpNeeded"] is False
    finally:
        app.dependency_overrides = {}


def test_evaluate_text_accepts_criteria_only_payload(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
    }

    monkeypatch.setattr("app.main._get_user_credits", lambda uid: 1)
    monkeypatch.setattr("app.main._debit_credits", lambda uid, amount=1: 0)

    payload = {
        "transcript": (
            "Eu responderia em tres passos: primeiro contexto, depois decisao tecnica e por fim resultado. "
            "Usaria Redis com TTL e invalidacao por eventos porque reduz latencia com consistencia controlada."
        ),
        "criteriaScores": {
            "clareza": 8,
            "estrutura": 7,
            "relevancia": 8,
            "precisao_tecnica": 7,
            "comunicacao": 8,
        },
        "strengths": [],
        "improvements": [],
    }

    def fake_generate(*args, **kwargs):
        return AIResult(
            output_text=json.dumps(payload),
            provider_used="test",
            model_used="test-model",
            latency_ms=5,
            tokens_used=10,
        )

    monkeypatch.setattr("app.main.ai_router.generate", fake_generate)

    try:
        client = TestClient(app)
        body = {
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "backend",
                "seniority": "mid",
                "stacks": ["python", "redis"],
                "style": "friendly",
                "duration": 20,
                "plan": "free",
                "jobDescription": None,
            },
            "question": "Como desenhar cache distribuido?",
            "transcript": "placeholder",
            "confirmedName": "Ana",
        }
        resp = client.post("/ai/evaluate-text", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["criteriaScores"]["clarity"] == 8
        assert data["criteriaScores"]["technicalPrecision"] == 7
        assert data["scores"]["technical"] >= 7
        assert data["scores"]["problemSolving"] >= 7
        assert data["followUpNeeded"] is False
    finally:
        app.dependency_overrides = {}
