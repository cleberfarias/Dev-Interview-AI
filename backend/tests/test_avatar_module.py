from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "avatar-user",
        "email": "avatar@example.com",
        "name": "Avatar User",
        "picture": None,
        "token": "test-token",
    }


def test_avatar_respond_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_avatar.avatar_controller.generate_avatar_response",
        lambda **kwargs: {
            "audio": "ZmFrZS1hdWRpbw==",
            "mimeType": "audio/mpeg",
            "lipsync": {"frames": [{"time": 0.1, "viseme": "A"}], "durationMs": 1200},
            "emotion": "neutral",
            "ttsProvider": "openai",
            "render": {"state": "speaking", "facialPreset": "neutral", "intensity": 0.5, "meta": {}},
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/avatar/respond",
            json={
                "text": "Fale sobre sua experiencia com React.",
                "language": "pt-BR",
                "sessionId": "sess-avatar-1",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["audio"] == "ZmFrZS1hdWRpbw=="
        assert data["emotion"] == "neutral"
        assert data["lipsync"]["frames"][0]["viseme"] == "A"
        assert data["ttsProvider"] == "openai"
    finally:
        app.dependency_overrides = {}
