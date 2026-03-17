from __future__ import annotations

import base64
import hashlib
import os
from datetime import datetime, timezone

from ..repositories import audio_chunk_repository, audio_chunk_storage_repository
from ..schemas import AudioChunkUploadRequest, AudioChunkUploadResponse, LiveCoachProcessRequest
from . import live_coach_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalized_base64(audio_base64: str) -> str:
    raw = str(audio_base64 or "").strip()
    if not raw:
        return ""
    if "," in raw:
        raw = raw.split(",", 1)[1]
    return raw


def _decode_audio_bytes(audio_base64: str) -> bytes:
    raw = _normalized_base64(audio_base64)
    if not raw:
        return b""
    try:
        return base64.b64decode(raw + ("=" * (-len(raw) % 4)))
    except Exception:
        return b""


def _audio_size_bytes(audio_bytes: bytes) -> int:
    return len(audio_bytes or b"")


def _audio_hash(audio_bytes: bytes) -> str:
    if not audio_bytes:
        return ""
    return hashlib.sha256(audio_bytes).hexdigest()


def _inline_audio_payload(audio_base64: str, max_chars: int = 850000) -> tuple[str | None, bool]:
    raw = _normalized_base64(audio_base64)
    if not raw:
        return None, False
    if len(raw) > max_chars:
        return None, False
    return raw, True


def _storage_prefix() -> str:
    return (os.environ.get("AUDIO_CHUNK_BUCKET_PREFIX") or "audio_chunks").strip() or "audio_chunks"


def _duplicate_response(chunk_id: str, stored_payload: dict, audio_bytes: int = 0) -> AudioChunkUploadResponse:
    return AudioChunkUploadResponse(
        ok=True,
        chunkId=chunk_id,
        duplicate=True,
        stored=True,
        payloadStored=bool(stored_payload.get("payloadStored")),
        storagePath=stored_payload.get("storagePath"),
        storageProvider=stored_payload.get("storageProvider"),
        processedWithLiveCoach=bool(stored_payload.get("processedWithLiveCoach")),
        liveCoachStatus=stored_payload.get("liveCoachStatus"),
        audioBytes=int(stored_payload.get("audioBytes") or audio_bytes or 0),
    )


def upload_chunk(payload: AudioChunkUploadRequest, user: dict | None = None) -> AudioChunkUploadResponse:
    chunk_id = audio_chunk_repository.build_chunk_id(
        session_id=payload.sessionId,
        question_id=payload.questionId,
        chunk_index=payload.chunkIndex,
        provided_chunk_id=payload.chunkId,
    )
    existing_payload = audio_chunk_repository.get_chunk_metadata(chunk_id)
    if existing_payload is not None:
        return _duplicate_response(chunk_id, existing_payload)

    decoded_audio = _decode_audio_bytes(payload.audioBase64)
    audio_bytes = _audio_size_bytes(decoded_audio)
    inline_audio, payload_stored = _inline_audio_payload(payload.audioBase64)
    storage_path = None
    storage_provider = None

    if not payload_stored and decoded_audio:
        try:
            storage_path = audio_chunk_storage_repository.upload_audio_chunk_bytes(
                session_id=payload.sessionId,
                question_id=payload.questionId,
                chunk_id=chunk_id,
                audio_bytes=decoded_audio,
                mime_type=payload.mimeType,
                prefix=_storage_prefix(),
            )
        except Exception:
            storage_path = None

        if storage_path:
            payload_stored = True
            storage_provider = "firebase_storage"

    created, stored_payload = audio_chunk_repository.create_chunk_metadata(
        chunk_id,
        {
            "sessionId": payload.sessionId,
            "answerId": payload.answerId,
            "questionId": payload.questionId,
            "chunkIndex": int(payload.chunkIndex),
            "startedAt": payload.startedAt,
            "endedAt": payload.endedAt,
            "durationMs": int(payload.durationMs),
            "mimeType": payload.mimeType,
            "audioBytes": audio_bytes,
            "audioSha256": _audio_hash(decoded_audio),
            "audioBase64": inline_audio,
            "payloadStored": payload_stored,
            "storagePath": storage_path,
            "storageProvider": storage_provider,
            "uid": (user or {}).get("uid"),
            "receivedAt": _now_iso(),
            "processedWithLiveCoach": bool(payload.processWithLiveCoach),
        },
    )

    if not created:
        return _duplicate_response(chunk_id, stored_payload, audio_bytes)

    processed_with_live_coach = False
    live_coach_status = None
    if payload.processWithLiveCoach:
        response = live_coach_service.process_audio_chunk(
            LiveCoachProcessRequest(
                audioBase64=payload.audioBase64,
                mimeType=payload.mimeType,
                context={
                    "sessionId": payload.sessionId,
                    "questionId": payload.questionId,
                    "chunkId": chunk_id,
                    "chunkIndex": int(payload.chunkIndex),
                    "startedAt": payload.startedAt,
                    "endedAt": payload.endedAt,
                    "durationMs": int(payload.durationMs),
                },
            ),
            user,
        )
        processed_with_live_coach = True
        live_coach_status = response.status

    return AudioChunkUploadResponse(
        ok=True,
        chunkId=chunk_id,
        duplicate=False,
        stored=True,
        payloadStored=payload_stored,
        storagePath=storage_path,
        storageProvider=storage_provider,
        processedWithLiveCoach=processed_with_live_coach,
        liveCoachStatus=live_coach_status,
        audioBytes=audio_bytes,
    )
