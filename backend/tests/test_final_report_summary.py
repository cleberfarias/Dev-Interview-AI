import json

from fastapi.testclient import TestClient

from app.ai.router import AIResult
from app.firebase_admin import get_current_user
from app.main import app


def test_final_report_includes_criteria_summary(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
    }

    monkeypatch.setattr("app.main._get_user_credits", lambda uid: 1)
    monkeypatch.setattr("app.main._debit_credits", lambda uid, amount=1: 0)

    report_payload = {
        "overallScore": 6.5,
        "levelEstimate": "mid",
        "jobMatch": {"covered": ["python"], "gaps": ["kubernetes"]},
        "feedback": {
            "posture": [],
            "communication": ["Organize melhor a resposta."],
            "technical": ["Boa base tecnica."],
            "language": [],
        },
        "plan7Days": [{"day": 1, "task": "Praticar STAR."}],
    }

    def fake_generate(*args, **kwargs):
        return AIResult(
            output_text=json.dumps(report_payload),
            provider_used="test",
            model_used="test-model",
            latency_ms=5,
            tokens_used=10,
        )

    monkeypatch.setattr("app.main.ai_router.generate", fake_generate)

    history = [
        {
            "question": "Pergunta 1",
            "evaluation": {
                "scores": {
                    "communication": 8,
                    "technical": 7,
                    "problemSolving": 7,
                    "presence": 8,
                },
                "criteriaScores": {
                    "clarity": 8,
                    "structure": 7,
                    "relevance": 7,
                    "technicalPrecision": 7,
                    "communication": 8,
                },
            },
        },
        {
            "question": "Pergunta 2",
            "evaluation": {
                "scores": {
                    "communication": 6,
                    "technical": 6,
                    "problemSolving": 5,
                    "presence": 6,
                },
                "criteriaScores": {
                    "clarity": 6,
                    "structure": 5,
                    "relevance": 6,
                    "technicalPrecision": 6,
                    "communication": 6,
                },
            },
        },
    ]

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
            "history": history,
        }
        resp = client.post("/ai/final-report", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scoresSummary"]["technical"] == 6.5
        assert data["criteriaSummary"]["clarity"] == 7.0
        assert data["criteriaSummary"]["technicalPrecision"] == 6.5
        assert data["overallScore"] == 6.6
    finally:
        app.dependency_overrides = {}
