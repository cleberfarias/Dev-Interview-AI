from __future__ import annotations

import base64
from datetime import datetime, timezone

from ..repositories import audio_chunk_repository
from ..schemas import AudioChunkUploadRequest, AudioChunkUploadResponse, LiveCoachProcessRequest
from . import live_coach_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audio_size_bytes(audio_base64: str) -> int:
    raw = str(audio_base64 or "").strip()
    if not raw:
        return 0
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return len(base64.b64decode(raw + ("=" * (-len(raw) % 4))))
    except Exception:
        return 0


def upload_chunk(payload: AudioChunkUploadRequest, user: dict | None = None) -> AudioChunkUploadResponse:
    chunk_id = audio_chunk_repository.build_chunk_id(
        session_id=payload.sessionId,
        question_id=payload.questionId,
        chunk_index=payload.chunkIndex,
        provided_chunk_id=payload.chunkId,
    )
    audio_bytes = _audio_size_bytes(payload.audioBase64)

    created, _stored = audio_chunk_repository.create_chunk_metadata(
        chunk_id,
        {
            "sessionId": payload.sessionId,
            "questionId": payload.questionId,
            "chunkIndex": int(payload.chunkIndex),
            "startedAt": payload.startedAt,
            "endedAt": payload.endedAt,
            "durationMs": int(payload.durationMs),
            "mimeType": payload.mimeType,
            "audioBytes": audio_bytes,
            "uid": (user or {}).get("uid"),
            "receivedAt": _now_iso(),
            "processedWithLiveCoach": bool(payload.processWithLiveCoach),
        },
    )

    processed_with_live_coach = False
    live_coach_status = None
    if payload.processWithLiveCoach and created:
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
        duplicate=not created,
        stored=True,
        processedWithLiveCoach=processed_with_live_coach,
        liveCoachStatus=live_coach_status,
        audioBytes=audio_bytes,
    )
