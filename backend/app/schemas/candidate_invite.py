from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, EmailStr


class CandidateInvite(BaseModel):
    id: str
    companyId: str
    templateId: str
    candidateName: str
    candidateEmail: EmailStr
    status: str = "sent"
    token: str
    createdAt: str
    updatedAt: Optional[str] = None


class CandidateInviteCreateRequest(BaseModel):
    templateId: str = Field(min_length=4)
    candidateName: str = Field(min_length=2)
    candidateEmail: EmailStr


class CandidateInviteListResponse(BaseModel):
    items: list[CandidateInvite] = Field(default_factory=list)
