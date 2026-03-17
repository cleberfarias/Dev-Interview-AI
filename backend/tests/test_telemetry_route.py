from fastapi.testclient import TestClient

from app.main import app


def test_client_error_route_logs_error(monkeypatch):
    captured = {}

    def fake_error(message, extra=None):
        captured["message"] = message
        captured["extra"] = extra

    monkeypatch.setattr("app.api.routes_telemetry.logger.error", fake_error)

    client = TestClient(app)
    resp = client.post(
        "/telemetry/client-error",
        json={
            "kind": "window.error",
            "message": "Boom",
            "stack": "Error: Boom",
            "path": "/interview",
            "source": "web",
            "metadata": {"component": "InterviewRoomLayout"},
        },
        headers={"Origin": "https://dev-interview-ai.web.app", "User-Agent": "pytest"},
    )

    assert resp.status_code == 202
    assert resp.json() == {"ok": True}
    assert captured["message"] == "frontend_client_error"
    assert captured["extra"]["clientError"]["kind"] == "window.error"
    assert captured["extra"]["clientError"]["metadata"]["component"] == "InterviewRoomLayout"
    assert captured["extra"]["origin"] == "https://dev-interview-ai.web.app"
