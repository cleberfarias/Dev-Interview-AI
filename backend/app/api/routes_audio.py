from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..request_context import scoped_context
from ..schemas import AudioChunkUploadRequest, AudioChunkUploadResponse
from ..services import audio_chunk_service

router = APIRouter()


@router.post("/audio/chunk", response_model=AudioChunkUploadResponse)
def upload_audio_chunk(payload: AudioChunkUploadRequest, user=Depends(get_current_user)):
    with scoped_context(user_id=str(user.get("uid") or ""), session_id=payload.sessionId):
        return audio_chunk_service.upload_chunk(payload, user)
