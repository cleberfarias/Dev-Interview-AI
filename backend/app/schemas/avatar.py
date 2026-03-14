from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AvatarRespondRequest(BaseModel):
    text: str
    emotion: Optional[str] = None
    language: str = "pt-BR"
    voice: Optional[str] = None
    sessionId: Optional[str] = None


class AvatarVisemeFrame(BaseModel):
    time: float
    viseme: str


class AvatarLipsyncPayload(BaseModel):
    frames: List[AvatarVisemeFrame] = Field(default_factory=list)
    durationMs: int = 0


class AvatarRenderPayload(BaseModel):
    state: str = "speaking"
    facialPreset: str = "neutral"
    intensity: float = 0.5
    meta: Dict[str, Any] = Field(default_factory=dict)


class AvatarResponse(BaseModel):
    audio: str = ""
    mimeType: str = "audio/mpeg"
    lipsync: AvatarLipsyncPayload = Field(default_factory=AvatarLipsyncPayload)
    emotion: str = "neutral"
    ttsProvider: str = "fallback"
    render: AvatarRenderPayload = Field(default_factory=AvatarRenderPayload)
