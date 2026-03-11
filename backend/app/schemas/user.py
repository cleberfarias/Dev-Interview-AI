from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


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
