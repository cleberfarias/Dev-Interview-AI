from fastapi.testclient import TestClient

import app.api.routes_live_coach as routes_live_coach
from app.firebase_admin import get_current_user
from app.main import app

LIVE_COACH_WS_SUBPROTOCOL = "live-coach.v1"
LIVE_COACH_WS_TOKEN_PROTOCOL = "firebase-id-token.fake-token"


def _auth_user():
    return {
        "uid": "live-coach-user",
        "email": "livecoach@example.com",
        "name": "Live Coach User",
        "picture": None,
        "token": "test-token",
    }


def test_live_coach_process_with_context_transcript():
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": "ZmFrZS1hdWRpby1ieXRlcw==",
                "context": {
                    "source": "mic",
                    "questionText": "Como voce escalaria uma API para 1M de requisicoes por minuto?",
                    "candidateProfile": {
                        "targetRole": "Backend Engineer",
                        "primarySkills": ["python", "fastapi", "redis"],
                        "weakSkills": ["kubernetes"],
                    },
                },
            },
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "ok"
        assert data["audioReceived"] is True
        assert data["contextUsed"] is True
        assert data["questionType"] in {"technical", "system_design", "general"}
        assert isinstance(data["suggestion"], str)
        assert isinstance(data["recommendedStructure"], list)
        assert isinstance(data["keyPoints"], list)
        assert data["transcriptionProvider"] in {"payload_text", "context", None}
    finally:
        app.dependency_overrides = {}


def test_live_coach_process_with_text_audio_payload():
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        text_audio_base64 = "Q29tbyB2b2NlIHJlc29sdmVyaWEgY29uY29ycmVuY2lhIGVtIHNpemNyaXRhIGRlIGRhZG9zPw=="
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": text_audio_base64,
                "context": {"source": "mic"},
            },
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "ok"
        assert isinstance(data["transcript"], str)
        assert data["transcript"] != ""
        assert data["detectedQuestion"] is not None
        assert data["questionType"] in {"technical", "system_design", "coding", "behavioral", "general"}
        assert data["transcriptionProvider"] == "payload_text"
    finally:
        app.dependency_overrides = {}


def test_live_coach_process_uses_openai_transcription_when_enabled(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key-1234567890")
    monkeypatch.setenv("LIVE_COACH_STT_PROVIDER", "openai")
    monkeypatch.setattr(
        "app.live_coach.pipeline._openai_transcribe_audio",
        lambda audio_bytes, mime_type="audio/webm": "Como voce trataria concorrencia em escrita de dados?",
    )

    try:
        client = TestClient(app)
        binary_audio_base64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": binary_audio_base64,
                "mimeType": "audio/webm",
                "context": {"source": "mic"},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["transcriptionProvider"] == "openai"
        assert data["transcriptionError"] is None
        assert data["transcript"].startswith("Como voce")
        assert data["questionType"] in {"technical", "system_design", "coding", "behavioral", "general"}
    finally:
        app.dependency_overrides = {}


def test_live_coach_process_uses_interview_history_context():
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": "Q29tbyB2b2NlIGRlc2VuaGFyaWEgdW0gc2lzdGVtYSByZXNpbGllbnRlPw==",
                "context": {
                    "source": "interview-room",
                    "questionText": "Como voce desenharia um sistema resiliente?",
                    "interviewHistory": [
                        {
                            "question": "Pergunta anterior",
                            "scores": {
                                "communication": 7,
                                "technical": 3,
                                "problemSolving": 6,
                                "presence": 6,
                            },
                        }
                    ],
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        joined_points = " ".join(data.get("keyPoints") or []).lower()
        assert "precisao tecnica" in joined_points or "tecnica" in joined_points
    finally:
        app.dependency_overrides = {}


def test_live_coach_websocket_process_message(monkeypatch):
    monkeypatch.setattr(
        routes_live_coach,
        "verify_bearer_token",
        lambda authorization: {
            "uid": "ws-live-coach-user",
            "email": "ws@example.com",
            "name": "WS Coach",
            "picture": None,
        },
    )

    client = TestClient(app)
    with client.websocket_connect(
        "/live-coach/ws",
        subprotocols=[LIVE_COACH_WS_SUBPROTOCOL, LIVE_COACH_WS_TOKEN_PROTOCOL],
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"

        websocket.send_json({"type": "ping", "requestId": "req-ping"})
        pong = websocket.receive_json()
        assert pong["type"] == "pong"
        assert pong["requestId"] == "req-ping"

        websocket.send_json(
            {
                "type": "process",
                "requestId": "req-1",
                "payload": {
                    "audioBase64": "Q29tbyB2b2NlIGRlc2VuaGFyaWEgdW0gc2lzdGVtYSByZXNpbGllbnRlPw==",
                    "context": {
                        "source": "interview-room",
                        "questionText": "Como voce desenharia um sistema resiliente?",
                    },
                },
            }
        )
        response = websocket.receive_json()
        assert response["type"] == "insight"
        assert response["requestId"] == "req-1"
        assert response["payload"]["status"] == "ok"


def test_live_coach_websocket_audio_chunk_streaming_events(monkeypatch):
    monkeypatch.setattr(
        routes_live_coach,
        "verify_bearer_token",
        lambda authorization: {
            "uid": "ws-live-coach-user",
            "email": "ws@example.com",
            "name": "WS Coach",
            "picture": None,
        },
    )

    client = TestClient(app)
    with client.websocket_connect(
        "/live-coach/ws",
        subprotocols=[LIVE_COACH_WS_SUBPROTOCOL, LIVE_COACH_WS_TOKEN_PROTOCOL],
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"

        websocket.send_json(
            {
                "type": "audio_chunk",
                "requestId": "chunk-1",
                "payload": {
                    "audioChunks": [
                        {
                            "chunkIndex": 1,
                            "audio": "Q29tbyB2b2NlIGRlc2VuaGFyaWEgdW0gc2lzdGVtYSByZXNpbGllbnRlPw==",
                            "timestamp": "2026-03-13T12:00:00Z",
                        }
                    ],
                    "context": {
                        "source": "interview-room",
                        "questionText": "Como voce desenharia um sistema resiliente?",
                    },
                },
            }
        )

        partial = websocket.receive_json()
        assert partial["type"] == "partial_transcription"
        assert partial["requestId"] == "chunk-1"
        assert isinstance(partial["payload"]["transcript"], str)

        hint = websocket.receive_json()
        assert hint["type"] == "coach_hint"
        assert hint["requestId"] == "chunk-1"
        assert hint["payload"]["status"] in {"ok", "insufficient_context", "transcription_failed"}

        legacy = websocket.receive_json()
        assert legacy["type"] == "insight"
        assert legacy["requestId"] == "chunk-1"


def test_live_coach_websocket_accepts_api_prefix(monkeypatch):
    monkeypatch.setattr(
        routes_live_coach,
        "verify_bearer_token",
        lambda authorization: {
            "uid": "ws-live-coach-user",
            "email": "ws@example.com",
            "name": "WS Coach",
            "picture": None,
        },
    )

    client = TestClient(app)
    with client.websocket_connect(
        "/api/live-coach/ws",
        subprotocols=[LIVE_COACH_WS_SUBPROTOCOL, LIVE_COACH_WS_TOKEN_PROTOCOL],
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"
