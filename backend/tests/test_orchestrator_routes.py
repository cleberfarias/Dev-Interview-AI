from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "orchestrator-user",
        "email": "orch@example.com",
        "name": "Orchestrator User",
        "picture": None,
        "token": "test-token",
    }


def _config_payload():
    return {
        "uiLanguage": "pt-BR",
        "interviewLanguage": "pt-BR",
        "track": "backend",
        "seniority": "mid",
        "stacks": ["python", "fastapi"],
        "style": "friendly",
        "duration": 15,
        "plan": "free",
        "jobDescription": "Backend role",
    }


def test_orchestrator_context_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_orchestrator.orchestrator_service.build_context",
        lambda payload, user: {
            "profile": {"userId": user["uid"]},
            "candidate": {"skills": ["python"]},
            "job": {"requiredSkills": ["python"]},
            "match": {"matchScore": 85},
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/orchestrator/interview/context",
            json={"config": _config_payload()},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["profile"]["userId"] == "orchestrator-user"
        assert data["match"]["matchScore"] == 85
    finally:
        app.dependency_overrides = {}


def test_orchestrator_start_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_orchestrator.orchestrator_service.start",
        lambda payload, user: {
            "session": {
                "sessionId": "sess-1",
                "plan": None,
                "plan_status": "pending",
                "credits": 2,
            },
            "context": {
                "profile": {"userId": user["uid"]},
                "candidate": {"skills": ["python"]},
                "job": {"requiredSkills": ["python"]},
                "match": {"matchScore": 85},
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/orchestrator/interview/start",
            json={"config": _config_payload(), "includeContext": True},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["session"]["sessionId"] == "sess-1"
        assert data["context"]["candidate"]["skills"] == ["python"]
    finally:
        app.dependency_overrides = {}


def test_orchestrator_turn_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_orchestrator.orchestrator_service.run_turn",
        lambda payload, user: {
            "evaluation": {
                "scores": {
                    "communication": 8,
                    "technical": 7,
                    "problemSolving": 8,
                    "presence": 7,
                },
                "strengths": ["boa estrutura"],
                "improvements": ["mais detalhes"],
                "followUpNeeded": False,
                "transcript": payload.transcript or "ok",
            },
            "coach": {"tips": ["Use exemplos concretos"]},
            "nextQuestion": {
                "shouldFinish": False,
                "question": {
                    "id": "q2",
                    "section": "technical",
                    "difficulty": 3,
                    "prompt": "Fale sobre observabilidade.",
                },
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/orchestrator/interview/turn",
            json={
                "config": _config_payload(),
                "history": [],
                "question": "Como voce projetaria uma API?",
                "transcript": "Eu comeco pelos contratos.",
                "remainingSeconds": 600,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["evaluation"]["scores"]["technical"] == 7
        assert data["coach"]["tips"] == ["Use exemplos concretos"]
        assert data["nextQuestion"]["shouldFinish"] is False
    finally:
        app.dependency_overrides = {}


def test_orchestrator_finalize_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_orchestrator.orchestrator_service.finalize",
        lambda payload, user: {
            "report": {
                "overallScore": 8.2,
                "levelEstimate": "mid",
                "jobMatch": {"covered": ["python"], "gaps": ["system design"]},
                "feedback": {
                    "posture": [],
                    "communication": [],
                    "technical": [],
                    "language": [],
                },
                "plan7Days": [{"day": 1, "task": "Treinar perguntas de API"}],
            },
            "studyPlan": {
                "priorityTopics": ["system design"],
                "weeklyPlan": [{"day": 1, "task": "Treinar perguntas de API"}],
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/orchestrator/interview/finalize",
            json={
                "config": _config_payload(),
                "history": [],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["report"]["overallScore"] == 8.2
        assert data["studyPlan"]["priorityTopics"] == ["system design"]
    finally:
        app.dependency_overrides = {}
