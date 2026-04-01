from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "tool-debug-user",
        "email": "tooldebug@example.com",
        "name": "Tool Debug User",
        "picture": None,
        "token": "test-token",
    }


def test_get_ai_tools_debugger_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_ai.mcp_debugger_service.get_mcp_tool_debugger",
        lambda user, session_id, track, seniority, stacks, question: {
            "generatedAt": "2026-03-31T15:00:00+00:00",
            "sessionId": session_id,
            "tools": [
                {
                    "name": "get_candidate_memory",
                    "label": "Memoria consolidada",
                    "contractVersion": "mcp.devinterview.v1",
                    "status": "ready",
                    "summary": "Memoria pronta.",
                    "data": {"toolName": "get_candidate_memory", "hasMemory": True},
                }
            ],
        },
    )

    try:
        client = TestClient(app)
        resp = client.get(
            "/ai/tools/debugger",
            params={
                "sessionId": "sess-1",
                "track": "frontend",
                "seniority": "mid",
                "stacks": ["React", "TypeScript"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sessionId"] == "sess-1"
        assert data["tools"][0]["name"] == "get_candidate_memory"
        assert data["tools"][0]["contractVersion"] == "mcp.devinterview.v1"
    finally:
        app.dependency_overrides = {}
