from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CompanyInterviewResult(BaseModel):
    id: str
    companyId: str
    templateId: str
    candidateName: str
    technicalScore: float
    communicationScore: float
    behavioralScore: float
    overallScore: float
    recommendation: str
    createdAt: str
    updatedAt: Optional[str] = None


class CompanyInterviewResultCreateRequest(BaseModel):
    templateId: str
    candidateName: str
    technicalScore: float
    communicationScore: float
    behavioralScore: float
    overallScore: float
    recommendation: str = Field(default="")


class CompanyInterviewResultListResponse(BaseModel):
    items: list[CompanyInterviewResult] = Field(default_factory=list)
