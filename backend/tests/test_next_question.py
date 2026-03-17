import json

from fastapi.testclient import TestClient

from app.main import app
from app.ai.router import AIResult
from app.firebase_admin import get_current_user


def _config():
    return {
        "uiLanguage": "pt-BR",
        "interviewLanguage": "pt-BR",
        "track": "backend",
        "seniority": "mid",
        "stacks": ["python"],
        "style": "friendly",
        "duration": 20,
        "plan": "free",
        "jobDescription": None,
    }


def test_next_question_time_low_skips_ai(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    def _boom(*args, **kwargs):
        raise AssertionError("AI should not be called when time is low")

    monkeypatch.setattr("app.main.ai_router.generate", _boom)

    try:
        client = TestClient(app)
        body = {
            "config": _config(),
            "history": [],
            "remainingSeconds": 30,
            "difficultyLevel": 2,
        }
        resp = client.post("/ai/next-question", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["shouldFinish"] is True
    finally:
        app.dependency_overrides = {}


def test_next_question_finishes_after_five_answers(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    def _boom(*args, **kwargs):
        raise AssertionError("AI should not be called after five answered questions")

    monkeypatch.setattr("app.main.ai_router.generate", _boom)

    try:
        client = TestClient(app)
        history = [
            {
                "questionId": f"q{index + 1}",
                "question": f"Pergunta {index + 1}",
                "section": "technical",
                "difficulty": 3,
                "evaluation": {
                    "scores": {
                        "communication": 7,
                        "technical": 6,
                        "problemSolving": 6,
                        "presence": 7,
                    }
                },
            }
            for index in range(5)
        ]
        body = {
            "config": _config(),
            "history": history,
            "remainingSeconds": 300,
            "difficultyLevel": 2,
        }
        resp = client.post("/ai/next-question", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["shouldFinish"] is True
        assert data["reason"] == "time_or_max"
    finally:
        app.dependency_overrides = {}


def test_next_question_happy_path(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    payload = {
        "shouldFinish": False,
        "question": {
            "id": "q2",
            "section": "technical",
            "difficulty": 3,
            "prompt": "Explique o que e cache.",
        },
    }

    def _fake_generate(*args, **kwargs):
        return AIResult(
            output_text=json.dumps(payload),
            provider_used="test",
            model_used="test-model",
            latency_ms=5,
            tokens_used=10,
        )

    monkeypatch.setattr("app.main.ai_router.generate", _fake_generate)

    try:
        client = TestClient(app)
        body = {
            "config": _config(),
            "history": [
                {
                    "questionId": "q1",
                    "question": "O que e uma API?",
                    "section": "technical",
                    "difficulty": 3,
                    "evaluation": {"scores": {"communication": 7, "technical": 6, "problemSolving": 6, "presence": 7}},
                }
            ],
            "remainingSeconds": 600,
            "difficultyLevel": 2,
        }
        resp = client.post("/ai/next-question", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["shouldFinish"] is False
        assert data["question"]["prompt"] == "Explique o que e cache."
    finally:
        app.dependency_overrides = {}


def test_next_question_retries_on_invalid_payload(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    valid_payload = {
        "shouldFinish": False,
        "question": {
            "id": "q2",
            "section": "technical",
            "difficulty": 3,
            "prompt": "Explique idempotencia em APIs.",
        },
    }
    calls = {"count": 0}

    def _fake_generate(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return AIResult(
                output_text="invalid-json-response",
                provider_used="test",
                model_used="test-model",
                latency_ms=5,
                tokens_used=10,
            )
        return AIResult(
            output_text=json.dumps(valid_payload),
            provider_used="test",
            model_used="test-model",
            latency_ms=6,
            tokens_used=12,
        )

    monkeypatch.setattr("app.main.ai_router.generate", _fake_generate)

    try:
        client = TestClient(app)
        body = {
            "config": _config(),
            "history": [
                {
                    "questionId": "q1",
                    "question": "O que e cache?",
                    "section": "technical",
                    "difficulty": 3,
                    "evaluation": {"scores": {"communication": 7, "technical": 6, "problemSolving": 6, "presence": 7}},
                }
            ],
            "remainingSeconds": 600,
            "difficultyLevel": 2,
        }
        resp = client.post("/ai/next-question", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["shouldFinish"] is False
        assert data["question"]["prompt"] == "Explique idempotencia em APIs."
        assert calls["count"] == 2
    finally:
        app.dependency_overrides = {}
