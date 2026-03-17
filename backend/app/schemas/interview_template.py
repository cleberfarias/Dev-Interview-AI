from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class InterviewTemplate(BaseModel):
    id: str
    companyId: str
    name: str
    seniority: str
    topics: list[str] = Field(default_factory=list)
    questionCount: int = Field(default=6, ge=1, le=20)
    timeLimit: int = Field(default=20, ge=5, le=90)
    difficultyLevel: int = Field(default=3, ge=1, le=5)
    createdAt: str
    updatedAt: Optional[str] = None


class InterviewTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    seniority: str = Field(min_length=2, max_length=40)
    topics: list[str] = Field(default_factory=list)
    questionCount: int = Field(default=6, ge=1, le=20)
    timeLimit: int = Field(default=20, ge=5, le=90)
    difficultyLevel: int = Field(default=3, ge=1, le=5)


class InterviewTemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    seniority: Optional[str] = Field(default=None, min_length=2, max_length=40)
    topics: Optional[list[str]] = None
    questionCount: Optional[int] = Field(default=None, ge=1, le=20)
    timeLimit: Optional[int] = Field(default=None, ge=5, le=90)
    difficultyLevel: Optional[int] = Field(default=None, ge=1, le=5)


class InterviewTemplateListResponse(BaseModel):
    items: list[InterviewTemplate] = Field(default_factory=list)
