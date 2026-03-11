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
