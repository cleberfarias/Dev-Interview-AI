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
            "communicationAnalysis": {
                "answerId": "a1",
                "mode": "candidate_coaching_mode",
                "speechMetrics": {
                    "answerId": "a1",
                    "timeToFirstSpeechMs": 900,
                    "totalDurationMs": 18000,
                    "silenceDurationMs": 2200,
                    "pauseCount": 3,
                    "longPauseCount": 1,
                    "fillerCount": 1,
                    "hesitationMarkers": ["ahn"],
                    "wordsPerMinute": 128,
                    "interruptionRecoveryCount": 1,
                    "fluencyScore": 7.8,
                    "fluencyLevel": "high",
                },
                "communicationSignals": {
                    "responseClarity": 8.1,
                    "responseConfidence": 7.4,
                    "hesitationLevel": 0.22,
                    "verbalObjectivity": 7.6,
                    "professionalCommunication": 7.8,
                },
                "behavioralSpeechSignals": {
                    "assertiveness": 7.2,
                    "cautionLevel": 4.8,
                    "spontaneity": 6.9,
                    "consistency": 7.8,
                    "emotionalControl": 7.1,
                },
                "behaviorProfile": {
                    "communicationStyle": "analitico-direto",
                    "observedTraits": ["objetividade", "consistencia"],
                    "summary": "Perfil consistente.",
                    "discReadiness": {
                        "dominance": 7.4,
                        "influence": 6.5,
                        "steadiness": 6.8,
                        "conscientiousness": 8.1,
                    },
                    "guardrail": "Indicadores observados durante a entrevista; nao representam diagnostico psicologico ou laudo de personalidade.",
                },
                "cultureFitSignals": {
                    "collaboration": 7.3,
                    "ownership": 7.7,
                    "adaptability": 6.8,
                    "communicationFit": 7.5,
                    "overallAlignment": 7.3,
                    "supportingSignals": ["ownership", "colaboracao"],
                    "summary": "Bom alinhamento.",
                    "guardrail": "Sinais de apoio a decisao; nao substituem avaliacao humana.",
                },
            },
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
            "communicationAnalysis": {
                "answerId": "a2",
                "mode": "candidate_coaching_mode",
                "speechMetrics": {
                    "answerId": "a2",
                    "timeToFirstSpeechMs": 1400,
                    "totalDurationMs": 15000,
                    "silenceDurationMs": 3100,
                    "pauseCount": 4,
                    "longPauseCount": 2,
                    "fillerCount": 3,
                    "hesitationMarkers": ["tipo", "talvez"],
                    "wordsPerMinute": 110,
                    "interruptionRecoveryCount": 1,
                    "fluencyScore": 6.4,
                    "fluencyLevel": "moderate",
                },
                "communicationSignals": {
                    "responseClarity": 6.9,
                    "responseConfidence": 6.1,
                    "hesitationLevel": 0.38,
                    "verbalObjectivity": 6.8,
                    "professionalCommunication": 6.7,
                },
                "behavioralSpeechSignals": {
                    "assertiveness": 6.4,
                    "cautionLevel": 5.7,
                    "spontaneity": 6.2,
                    "consistency": 6.8,
                    "emotionalControl": 6.3,
                },
                "behaviorProfile": {
                    "communicationStyle": "estruturado-reflexivo",
                    "observedTraits": ["cautela"],
                    "summary": "Perfil mais cauteloso.",
                    "discReadiness": {
                        "dominance": 5.9,
                        "influence": 6.0,
                        "steadiness": 7.2,
                        "conscientiousness": 7.0,
                    },
                    "guardrail": "Indicadores observados durante a entrevista; nao representam diagnostico psicologico ou laudo de personalidade.",
                },
                "cultureFitSignals": {
                    "collaboration": 6.6,
                    "ownership": 6.8,
                    "adaptability": 6.2,
                    "communicationFit": 6.7,
                    "overallAlignment": 6.6,
                    "supportingSignals": ["adaptabilidade"],
                    "summary": "Alinhamento moderado.",
                    "guardrail": "Sinais de apoio a decisao; nao substituem avaliacao humana.",
                },
            },
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
        assert data["communicationScore"]["overall"] >= 6.5
        assert len(data["communicationStrengths"]) >= 1
        assert len(data["communicationImprovements"]) >= 1
        assert data["communicationSignals"]["responseClarity"] >= 7.0
        assert data["behavioralSpeechSignals"]["consistency"] >= 7.0
        assert data["behaviorProfile"]["communicationStyle"] in {"analitico-direto", "estruturado-reflexivo"}
        assert data["cultureFitSignals"]["overallAlignment"] >= 6.5
    finally:
        app.dependency_overrides = {}
