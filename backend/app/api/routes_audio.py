from __future__ import annotations

import base64
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from ..firebase_admin import get_current_user
from ..request_context import scoped_context
from ..schemas import AudioChunkUploadRequest, AudioChunkUploadResponse
from ..services import audio_chunk_service

router = APIRouter()


def _to_bool(value) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


async def _request_payload(request: Request) -> AudioChunkUploadRequest:
    content_type = (request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        audio_file = form.get("file")
        if audio_file is None or not hasattr(audio_file, "read"):
            raise HTTPException(status_code=400, detail="file is required")

        audio_bytes = await audio_file.read()
        audio_base64 = base64.b64encode(audio_bytes).decode("ascii")

        return AudioChunkUploadRequest(
            sessionId=str(form.get("sessionId") or "").strip(),
            answerId=str(form.get("answerId") or "").strip() or None,
            questionId=str(form.get("questionId") or "").strip() or None,
            chunkId=str(form.get("chunkId") or "").strip() or None,
            chunkIndex=int(form.get("chunkIndex") or 0),
            startedAt=str(form.get("startedAt") or "").strip(),
            endedAt=str(form.get("endedAt") or "").strip(),
            durationMs=int(form.get("durationMs") or 0),
            mimeType=str(form.get("mimeType") or audio_file.content_type or "audio/webm").strip(),
            audioBase64=audio_base64,
            processWithLiveCoach=_to_bool(form.get("processWithLiveCoach")),
        )

    try:
        raw_body = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid_json") from exc

    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=400, detail="invalid_payload")

    return AudioChunkUploadRequest(**raw_body)


@router.post("/audio/chunk", response_model=AudioChunkUploadResponse)
async def upload_audio_chunk(request: Request, user=Depends(get_current_user)):
    payload = await _request_payload(request)
    with scoped_context(user_id=str(user.get("uid") or ""), session_id=payload.sessionId):
        return audio_chunk_service.upload_chunk(payload, user)
