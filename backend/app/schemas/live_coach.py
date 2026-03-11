from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LiveCoachProcessRequest(BaseModel):
    audioBase64: str
    mimeType: str = "audio/webm"
    context: Dict[str, Any] = Field(default_factory=dict)


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
