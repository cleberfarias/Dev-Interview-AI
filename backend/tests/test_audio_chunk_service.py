import base64

from app.schemas import AudioChunkUploadRequest
from app.services import audio_chunk_service


def _build_payload(audio_base64: str, *, process_with_live_coach: bool = False) -> AudioChunkUploadRequest:
    return AudioChunkUploadRequest(
        sessionId="sess-1",
        questionId="q1",
        chunkId="sess-1__q1__1",
        chunkIndex=1,
        startedAt="2026-03-17T00:00:00Z",
        endedAt="2026-03-17T00:00:04Z",
        durationMs=4000,
        mimeType="audio/webm",
        audioBase64=audio_base64,
        processWithLiveCoach=process_with_live_coach,
    )


def test_upload_chunk_uses_storage_for_large_payload(monkeypatch):
    large_audio_base64 = base64.b64encode(b"x" * 700000).decode("ascii")
    metadata_call = {}
    storage_call = {}

    monkeypatch.setenv("AUDIO_CHUNK_BUCKET_PREFIX", "interview_chunks")
    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_repository.get_chunk_metadata",
        lambda chunk_id: None,
    )

    def fake_upload_audio_chunk_bytes(**kwargs):
        storage_call.update(kwargs)
        return "interview_chunks/sess-1/q1/sess-1__q1__1.webm"

    def fake_create_chunk_metadata(chunk_id, data):
        metadata_call["chunk_id"] = chunk_id
        metadata_call["data"] = data
        return True, {"id": chunk_id, **data}

    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_storage_repository.upload_audio_chunk_bytes",
        fake_upload_audio_chunk_bytes,
    )
    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_repository.create_chunk_metadata",
        fake_create_chunk_metadata,
    )

    response = audio_chunk_service.upload_chunk(_build_payload(large_audio_base64), {"uid": "user-1"})

    assert response.ok is True
    assert response.duplicate is False
    assert response.payloadStored is True
    assert response.storageProvider == "firebase_storage"
    assert response.storagePath == "interview_chunks/sess-1/q1/sess-1__q1__1.webm"
    assert response.audioBytes == 700000

    assert storage_call["session_id"] == "sess-1"
    assert storage_call["question_id"] == "q1"
    assert storage_call["chunk_id"] == "sess-1__q1__1"
    assert storage_call["mime_type"] == "audio/webm"
    assert storage_call["prefix"] == "interview_chunks"

    assert metadata_call["chunk_id"] == "sess-1__q1__1"
    assert metadata_call["data"]["audioBase64"] is None
    assert metadata_call["data"]["payloadStored"] is True
    assert metadata_call["data"]["storageProvider"] == "firebase_storage"
    assert metadata_call["data"]["storagePath"] == "interview_chunks/sess-1/q1/sess-1__q1__1.webm"
    assert metadata_call["data"]["audioBytes"] == 700000
    assert metadata_call["data"]["uid"] == "user-1"


def test_upload_chunk_returns_stored_duplicate_metadata(monkeypatch):
    storage_calls = []
    create_calls = []

    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_repository.get_chunk_metadata",
        lambda chunk_id: {
            "id": chunk_id,
            "payloadStored": True,
            "storagePath": "audio_chunks/sess-1/q1/sess-1__q1__1.webm",
            "storageProvider": "firebase_storage",
            "processedWithLiveCoach": True,
            "liveCoachStatus": "ok",
            "audioBytes": 3210,
        },
    )
    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_storage_repository.upload_audio_chunk_bytes",
        lambda **kwargs: storage_calls.append(kwargs),
    )
    monkeypatch.setattr(
        "app.services.audio_chunk_service.audio_chunk_repository.create_chunk_metadata",
        lambda chunk_id, data: create_calls.append((chunk_id, data)),
    )
    monkeypatch.setattr(
        "app.services.audio_chunk_service.live_coach_service.process_audio_chunk",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("live coach should not run for duplicates")),
    )

    response = audio_chunk_service.upload_chunk(
        _build_payload("ZmFrZQ==", process_with_live_coach=True),
        {"uid": "user-1"},
    )

    assert response.ok is True
    assert response.duplicate is True
    assert response.payloadStored is True
    assert response.storageProvider == "firebase_storage"
    assert response.storagePath == "audio_chunks/sess-1/q1/sess-1__q1__1.webm"
    assert response.processedWithLiveCoach is True
    assert response.liveCoachStatus == "ok"
    assert response.audioBytes == 3210
    assert storage_calls == []
    assert create_calls == []
