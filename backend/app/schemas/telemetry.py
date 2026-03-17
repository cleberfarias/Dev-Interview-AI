from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClientErrorLogRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    level: Literal["info", "warning", "error"] = "error"
    kind: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=4000)
    stack: str | None = Field(default=None, max_length=16000)
    componentStack: str | None = Field(default=None, max_length=8000)
    path: str | None = Field(default=None, max_length=2048)
    url: str | None = Field(default=None, max_length=4096)
    source: Literal["web", "android", "ios"] = "web"
    sessionId: str | None = Field(default=None, max_length=128)
    userAgent: str | None = Field(default=None, max_length=1024)
    timestamp: str | None = Field(default=None, max_length=128)
    metadata: dict[str, object] | None = None
