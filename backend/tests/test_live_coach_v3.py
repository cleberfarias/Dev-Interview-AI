from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "live-coach-v3-user",
        "email": "livecoachv3@example.com",
        "name": "Live Coach V3 User",
        "picture": None,
        "token": "test-token",
    }


def test_live_coach_returns_v3_signals_and_partial_feedback():
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": "QWhuLi4uIHRpcG8uLi4gZXUgY29tZWNhcmlhIGNvbSB1bSBlamVtcGxvIHByYXRpY28gZGUgQVBJIGUgbW9uaXRvcmFjYW8u",
                "context": {
                    "mode": "candidate_coaching_mode",
                    "answerId": "answer-v3-1",
                    "chunkIndex": 2,
                    "partialFeedbackEnabled": True,
                    "partialFeedbackDelivered": False,
                    "speechMetrics": {
                        "answerId": "answer-v3-1",
                        "timeToFirstSpeechMs": 1800,
                        "totalDurationMs": 9000,
                        "silenceDurationMs": 3200,
                        "pauseCount": 4,
                        "longPauseCount": 2,
                        "fillerCount": 4,
                        "hesitationMarkers": ["ahn", "tipo"],
                        "wordsPerMinute": 92,
                        "interruptionRecoveryCount": 0,
                        "fluencyScore": 4.9,
                        "fluencyLevel": "moderate",
                    },
                },
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "candidate_coaching_mode"
        assert data["speechMetrics"]["answerId"] == "answer-v3-1"
        assert data["communicationSignals"]["responseConfidence"] > 0
        assert data["behavioralSpeechSignals"]["consistency"] > 0
        assert data["partialFeedbackTriggered"] is True
        assert data["partialFeedback"]["type"] == "partial_feedback"
    finally:
        app.dependency_overrides = {}


def test_live_coach_hiring_mode_suppresses_partial_feedback():
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        resp = client.post(
            "/live-coach/process",
            json={
                "audioBase64": "QWhuLi4uIHRpcG8uLi4gZXUgY29tZWNhcmlhIGNvbSB1bSBlamVtcGxvIHByYXRpY28gZGUgQVBJIGUgbW9uaXRvcmFjYW8u",
                "context": {
                    "mode": "hiring_assessment_mode",
                    "answerId": "answer-v3-2",
                    "chunkIndex": 3,
                    "partialFeedbackEnabled": True,
                    "partialFeedbackDelivered": False,
                    "speechMetrics": {
                        "answerId": "answer-v3-2",
                        "timeToFirstSpeechMs": 2200,
                        "totalDurationMs": 10000,
                        "silenceDurationMs": 4200,
                        "pauseCount": 4,
                        "longPauseCount": 2,
                        "fillerCount": 5,
                        "hesitationMarkers": ["ahn", "tipo"],
                        "wordsPerMinute": 80,
                        "interruptionRecoveryCount": 0,
                        "fluencyScore": 4.5,
                        "fluencyLevel": "moderate",
                    },
                },
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "hiring_assessment_mode"
        assert data["partialFeedbackTriggered"] is False
        assert data["partialFeedback"] is None
        assert data["communicationSignals"]["hesitationLevel"] > 0
    finally:
        app.dependency_overrides = {}
