import json

from fastapi.testclient import TestClient

from app.ai.router import AIResult
from app.firebase_admin import get_current_user
from app.main import app
from app.request_context import append_tool_call
from app.schemas.analysis import BehaviorProfile, CandidateProfile, CultureFitSignals


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


def test_final_report_enriches_raw_history_without_inline_evaluation(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
    }

    monkeypatch.setattr("app.main._get_user_credits", lambda uid: 1)
    monkeypatch.setattr("app.main._debit_credits", lambda uid, amount=1: 0)
    monkeypatch.setattr(
        "app.services.report_service.candidate_profile_service.get_candidate_profile",
        lambda user: CandidateProfile(userId=user["uid"], primarySkills=["react", "typescript"]),
    )
    monkeypatch.setattr("app.services.report_service.job_agent.run", lambda **kwargs: {})
    monkeypatch.setattr("app.services.report_service.match_agent.run", lambda **kwargs: {})
    monkeypatch.setattr(
        "app.services.report_service.behavior_agent.run",
        lambda **kwargs: BehaviorProfile(
            communicationStyle="analitico-direto",
            observedTraits=["clareza"],
            summary="Perfil objetivo.",
        ),
    )
    monkeypatch.setattr(
        "app.services.report_service.culture_fit_agent.run",
        lambda **kwargs: CultureFitSignals(
            collaboration=7.4,
            ownership=7.8,
            adaptability=7.0,
            communicationFit=7.5,
            overallAlignment=7.4,
            supportingSignals=["ownership"],
            summary="Bom alinhamento.",
        ),
    )

    report_payload = {
        "overallScore": 7.0,
        "levelEstimate": "mid",
        "jobMatch": {"covered": ["react"], "gaps": ["observability"]},
        "feedback": {
            "posture": [],
            "communication": ["Continue estruturando a resposta por contexto, acao e resultado."],
            "technical": ["Traga exemplos práticos com React e TypeScript."],
            "language": [],
        },
        "plan7Days": [{"day": 1, "task": "Revisar exemplos de arquitetura frontend."}],
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
            "answerId": "a1",
            "questionId": "q1",
            "question": "Como voce organiza estado compartilhado em uma aplicacao React grande?",
            "transcript": (
                "Eu comeco separando estado local do global. Em React eu deixo o que e visual dentro do componente "
                "e uso context ou uma store para regras compartilhadas. Primeiro olho acoplamento, depois impacto de "
                "renderizacao e por fim observabilidade para debugar fluxos criticos."
            ),
            "speechMetrics": {
                "answerId": "a1",
                "timeToFirstSpeechMs": 800,
                "totalDurationMs": 24000,
                "silenceDurationMs": 1800,
                "pauseCount": 2,
                "longPauseCount": 0,
                "fillerCount": 1,
                "hesitationMarkers": ["ahn"],
                "wordsPerMinute": 132,
                "interruptionRecoveryCount": 0,
                "fluencyScore": 8.0,
                "fluencyLevel": "high",
            },
        }
    ]

    try:
        client = TestClient(app)
        body = {
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "frontend",
                "seniority": "mid",
                "stacks": ["react", "typescript"],
                "style": "friendly",
                "duration": 20,
                "plan": "free",
                "jobDescription": None,
                "interviewMode": "candidate_coaching_mode",
            },
            "history": history,
        }
        resp = client.post("/ai/final-report", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scoresSummary"]["technical"] > 0
        assert data["criteriaSummary"]["technicalPrecision"] > 0
        assert data["criteriaSummary"]["structure"] > 0
        assert data["communicationScore"]["overall"] > 0
        assert data["communicationSignals"]["responseClarity"] > 0
        assert data["behaviorProfile"]["communicationStyle"] == "analitico-direto"
        assert data["cultureFitSignals"]["overallAlignment"] == 7.4
    finally:
        app.dependency_overrides = {}


def test_final_report_includes_semantic_rag_context(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "test-user",
        "email": "test@example.com",
        "name": "Test User",
        "picture": None,
        "token": "test-token",
    }

    monkeypatch.setattr("app.main._get_user_credits", lambda uid: 1)
    monkeypatch.setattr("app.main._debit_credits", lambda uid, amount=1: 0)
    monkeypatch.setattr(
        "app.interview_rag.candidate_profile_service.get_candidate_profile",
        lambda user: CandidateProfile(
            userId=user["uid"],
            primarySkills=["react", "typescript"],
            resumeSummary="Frontend engineer focused on React systems.",
            jobDescription="Need a frontend engineer with React, TypeScript and observability.",
        ),
    )
    monkeypatch.setattr(
        "app.interview_rag.memory_service.load_candidate_memory",
        lambda uid: {"recurringGaps": ["observability"], "strongSkills": ["react"]},
    )
    monkeypatch.setattr("app.knowledge_retrieval.user_repository.list_user_interviews", lambda uid, limit=3: [])
    def _fake_rubric(**kwargs):
        append_tool_call(
            {
                "toolName": "search_rubric_knowledge",
                "status": "ready",
                "transport": "local",
                "summary": "Rubrica pronta para frontend / mid com 2 stack(s).",
                "contractVersion": "mcp.devinterview.v1",
            }
        )
        return {}

    monkeypatch.setattr("app.knowledge_retrieval.mcp_search_rubric_knowledge", _fake_rubric)
    monkeypatch.setattr("app.knowledge_retrieval.mcp_get_rubric", _fake_rubric)
    captured = {}

    def _store_report_trace(session_id, trace, user):
        captured["sessionId"] = session_id
        captured["trace"] = trace

    monkeypatch.setattr("app.services.session_service.store_report_evidence_trace", _store_report_trace)

    report_payload = {
        "overallScore": 7.1,
        "levelEstimate": "mid",
        "jobMatch": {"covered": ["react"], "gaps": ["observability"]},
        "feedback": {
            "posture": [],
            "communication": ["Continue trazendo exemplos concretos."],
            "technical": ["Detalhe melhor observabilidade e monitoramento."],
            "language": [],
        },
        "plan7Days": [{"day": 1, "task": "Revisar monitoramento de frontend."}],
    }

    def fake_generate(*args, **kwargs):
        prompt = kwargs.get("prompt") or ""
        assert "Contexto RAG semantico para o relatorio final" in prompt
        assert "Evidencia da resposta 1" in prompt
        assert "observability" in prompt or "observabilidade" in prompt
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
            "answerId": "a1",
            "question": "Como voce instrumenta observabilidade em frontend?",
            "transcript": "Eu comeco com metricas, logs estruturados e tracing para detectar degradacao.",
            "clientRuntime": {
                "questionDeliveryLatencyMs": 1400,
                "analysisLatencyMs": 3800,
                "transportState": "avatar/tts em saida",
                "avatarState": "voz ativa",
                "coachState": "parcial ao vivo",
            },
            "evaluation": {
                "scores": {
                    "communication": 7,
                    "technical": 6,
                    "problemSolving": 6,
                    "presence": 7,
                },
                "improvements": ["observability"],
                "strengths": ["react"],
            },
        }
    ]

    try:
        client = TestClient(app)
        body = {
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "frontend",
                "seniority": "mid",
                "stacks": ["react", "typescript"],
                "style": "friendly",
                "duration": 20,
                "plan": "free",
                "jobDescription": "Need a frontend engineer with React, TypeScript and observability.",
                "interviewMode": "candidate_coaching_mode",
            },
            "history": history,
            "sessionId": "session-report-rag-1",
        }
        resp = client.post("/ai/final-report", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["jobMatch"]["gaps"] == ["observability"]
        assert data["overallScore"] == 6.5
        assert captured["sessionId"] == "session-report-rag-1"
        assert captured["trace"]["retrievalMode"] == "semantic"
        assert captured["trace"]["episodeHighlights"][0]["answerId"] == "a1"
        assert captured["trace"]["episodeHighlights"][0]["clientRuntime"]["coachState"] == "parcial ao vivo"
        assert captured["trace"]["toolCalls"][0]["toolName"] == "search_rubric_knowledge"
    finally:
        app.dependency_overrides = {}
