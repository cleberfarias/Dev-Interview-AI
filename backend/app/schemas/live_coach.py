from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class LiveCoachAudioChunk(BaseModel):
    chunkIndex: int
    audio: str
    timestamp: str = ""
    chunkId: Optional[str] = None
    startedAt: Optional[str] = None
    endedAt: Optional[str] = None
    durationMs: Optional[int] = None
    sessionId: Optional[str] = None
    questionId: Optional[str] = None


class LiveCoachProcessRequest(BaseModel):
    audioBase64: str = ""
    audioChunks: List[LiveCoachAudioChunk] = Field(default_factory=list)
    mimeType: str = "audio/webm"
    context: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_audio_payload(self):
        has_inline_audio = bool((self.audioBase64 or "").strip())
        has_chunks = any(bool((chunk.audio or "").strip()) for chunk in self.audioChunks)
        context_transcript = False
        if isinstance(self.context, dict):
            for key in ("transcript", "questionTranscript", "question_text", "questionText"):
                if str(self.context.get(key) or "").strip():
                    context_transcript = True
                    break
        if not has_inline_audio and not has_chunks and not context_transcript:
            raise ValueError("audioBase64 or audioChunks is required")
        return self


class LiveCoachProcessResponse(BaseModel):
    status: str
    transcript: str = ""
    detectedQuestion: Optional[str] = None
    questionType: Optional[str] = None
    suggestion: Optional[str] = None
    recommendedStructure: List[str] = Field(default_factory=list)
    keyPoints: List[str] = Field(default_factory=list)
    transcriptionProvider: Optional[str] = None
    transcriptionError: Optional[str] = None
    contextUsed: bool = False
    audioReceived: bool = False
