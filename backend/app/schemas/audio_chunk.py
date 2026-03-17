from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, model_validator


class AudioChunkUploadRequest(BaseModel):
    sessionId: str
    answerId: Optional[str] = None
    questionId: Optional[str] = None
    chunkId: Optional[str] = None
    chunkIndex: int
    startedAt: str
    endedAt: str
    durationMs: int = Field(default=0, ge=0)
    mimeType: str = "audio/webm"
    audioBase64: str
    processWithLiveCoach: bool = False

    @model_validator(mode="after")
    def validate_audio_payload(self):
        if not str(self.audioBase64 or "").strip():
            raise ValueError("audioBase64 is required")
        return self


class AudioChunkUploadResponse(BaseModel):
    ok: bool = True
    chunkId: str
    duplicate: bool = False
    stored: bool = True
    payloadStored: bool = False
    storagePath: Optional[str] = None
    storageProvider: Optional[str] = None
    processedWithLiveCoach: bool = False
    liveCoachStatus: Optional[str] = None
    audioBytes: int = 0
