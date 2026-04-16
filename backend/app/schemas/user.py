from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class InterviewHistoryItem(BaseModel):
    id: str
    date: str
    role: str
    score: float
    style: str
    track: str


class UserProfile(BaseModel):
    uid: str
    name: str
    email: str
    avatar: Optional[str] = None
    credits: int = 0
    interviews: List[InterviewHistoryItem] = Field(default_factory=list)
    tourCompletions: Dict[str, str] = Field(default_factory=dict)


class UserProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join((value or "").split())
        if len(normalized) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return normalized
