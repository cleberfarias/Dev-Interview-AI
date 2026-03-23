from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "session-trace-user",
        "email": "sessiontrace@example.com",
        "name": "Session Trace User",
        "picture": None,
        "token": "test-token",
    }


def test_get_session_analysis_trace_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_sessions.session_service.get_session_analysis_trace",
        lambda session_id, user: {
            "sessionId": session_id,
            "hasTrace": True,
            "analysisTraceSnapshot": {
                "capturedAt": "2026-03-11T00:00:00+00:00",
                "lastResumeAnalysisTrace": {"source": "hybrid"},
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/sessions/sess-1/analysis-trace")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sessionId"] == "sess-1"
        assert data["hasTrace"] is True
        assert data["analysisTraceSnapshot"]["lastResumeAnalysisTrace"]["source"] == "hybrid"
    finally:
        app.dependency_overrides = {}


def test_get_session_report_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_sessions.session_service.get_session_report",
        lambda session_id, user: {
            "sessionId": session_id,
            "hasReport": True,
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "frontend",
                "seniority": "mid",
                "stacks": ["React"],
                "style": "friendly",
                "duration": 10,
                "plan": "free",
                "jobDescription": "",
                "interviewMode": "candidate_coaching_mode",
            },
            "report": {
                "overallScore": 8.2,
                "levelEstimate": "mid",
                "jobMatch": {"covered": ["react"], "gaps": []},
                "feedback": {
                    "posture": [],
                    "communication": [],
                    "technical": ["Bom dominio de React."],
                    "language": [],
                },
                "plan7Days": [],
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/sessions/sess-1/report")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sessionId"] == "sess-1"
        assert data["hasReport"] is True
        assert data["report"]["overallScore"] == 8.2
        assert data["config"]["track"] == "frontend"
    finally:
        app.dependency_overrides = {}
