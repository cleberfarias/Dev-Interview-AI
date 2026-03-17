from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "audio-user",
        "email": "audio@example.com",
        "name": "Audio User",
        "picture": None,
        "token": "test-token",
    }


def test_audio_chunk_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_audio.audio_chunk_service.upload_chunk",
        lambda payload, user: {
            "ok": True,
            "chunkId": payload.chunkId or "sess-1__q1__1",
            "duplicate": False,
            "stored": True,
            "processedWithLiveCoach": payload.processWithLiveCoach,
            "liveCoachStatus": "ok" if payload.processWithLiveCoach else None,
            "audioBytes": 256,
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/audio/chunk",
            json={
                "sessionId": "sess-1",
                "questionId": "q1",
                "chunkId": "sess-1__q1__1",
                "chunkIndex": 1,
                "startedAt": "2026-03-17T00:00:00Z",
                "endedAt": "2026-03-17T00:00:04Z",
                "durationMs": 4000,
                "mimeType": "audio/webm",
                "audioBase64": "ZmFrZQ==",
                "processWithLiveCoach": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["chunkId"] == "sess-1__q1__1"
        assert data["processedWithLiveCoach"] is True
        assert data["liveCoachStatus"] == "ok"
    finally:
        app.dependency_overrides = {}


def test_audio_chunk_route_accepts_multipart(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_audio.audio_chunk_service.upload_chunk",
        lambda payload, user: {
            "ok": True,
            "chunkId": payload.chunkId or "sess-1__q1__2",
            "duplicate": False,
            "stored": True,
            "payloadStored": True,
            "processedWithLiveCoach": False,
            "liveCoachStatus": None,
            "audioBytes": 512,
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/audio/chunk",
            data={
                "sessionId": "sess-1",
                "questionId": "q1",
                "chunkId": "sess-1__q1__2",
                "chunkIndex": "2",
                "startedAt": "2026-03-17T00:00:05Z",
                "endedAt": "2026-03-17T00:00:09Z",
                "durationMs": "4000",
                "mimeType": "audio/webm",
                "processWithLiveCoach": "false",
            },
            files={"file": ("chunk.webm", b"fake-audio", "audio/webm")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["chunkId"] == "sess-1__q1__2"
        assert data["payloadStored"] is True
    finally:
        app.dependency_overrides = {}
