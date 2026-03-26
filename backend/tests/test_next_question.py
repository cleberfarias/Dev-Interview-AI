import json

from fastapi.testclient import TestClient

from app.main import app
from app.ai.router import AIResult
from app.firebase_admin import get_current_user
from app.services import interview_core


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


def test_next_question_retries_on_repeated_question(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    repeated_payload = {
        "shouldFinish": False,
        "question": {
            "id": "q2",
            "section": "technical",
            "difficulty": 3,
            "prompt": "Como voce faria rollout seguro dessa mudanca?",
        },
    }
    valid_payload = {
        "shouldFinish": False,
        "question": {
            "id": "q2",
            "section": "technical",
            "difficulty": 3,
            "prompt": "Como protegeria endpoints criticos contra abuso e replay?",
        },
    }
    calls = {"count": 0}

    def _fake_generate(*args, **kwargs):
        calls["count"] += 1
        payload = repeated_payload if calls["count"] == 1 else valid_payload
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
                    "question": "Como voce faria rollout seguro de uma mudanca com risco alto?",
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
        assert data["question"]["prompt"] == "Como protegeria endpoints criticos contra abuso e replay?"
        assert calls["count"] == 2
    finally:
        app.dependency_overrides = {}


def test_find_similar_asked_question_detects_rephrased_prompt():
    matched = interview_core._find_similar_asked_question(
        "Como voce faria rollout seguro dessa mudanca?",
        [{"question": "Como voce faria rollout seguro de uma mudanca com risco alto?"}],
    )

    assert matched == "Como voce faria rollout seguro de uma mudanca com risco alto?"


def test_resolve_technical_difficulty_level_defaults_to_seniority():
    assert interview_core._resolve_technical_difficulty_level(None, "junior") == 1
    assert interview_core._resolve_technical_difficulty_level(None, "mid") == 2
    assert interview_core._resolve_technical_difficulty_level(None, "staff") == 3


def test_history_summary_for_next_keeps_behavior_and_culture_signals():
    summary = interview_core._summarize_history_for_next(
        [
            {
                "question": "Fale sobre incidentes.",
                "section": "behavioral",
                "difficulty": 3,
                "evaluation": {
                    "scores": {"communication": 8, "technical": 7, "problemSolving": 7, "presence": 8},
                    "strengths": ["clareza"],
                    "improvements": ["mais detalhes"],
                },
                "communicationAnalysis": {
                    "mode": "hiring_assessment_mode",
                    "behaviorProfile": {"communicationStyle": "analitico-direto"},
                    "cultureFitSignals": {"overallAlignment": 7.4},
                },
            }
        ]
    )

    assert summary[0]["communicationAnalysis"]["mode"] == "hiring_assessment_mode"
    assert summary[0]["communicationAnalysis"]["behaviorProfile"]["communicationStyle"] == "analitico-direto"
    assert summary[0]["communicationAnalysis"]["cultureFitSignals"]["overallAlignment"] == 7.4
