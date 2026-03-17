from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

CompanyPlan = Literal["business", "enterprise"]
CompanyRole = Literal["admin", "recruiter", "viewer"]


class Company(BaseModel):
    id: str
    name: str
    plan: CompanyPlan = "business"
    createdAt: str
    updatedAt: Optional[str] = None


class CompanyMembership(BaseModel):
    userId: str
    companyId: str
    role: CompanyRole
    createdAt: str
    updatedAt: Optional[str] = None


class CompanyCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    plan: CompanyPlan = "business"


class CompanyMembershipUpsertRequest(BaseModel):
    role: CompanyRole


class CompanyAccessContext(BaseModel):
    company: Company
    membership: CompanyMembership


class CompanySummary(BaseModel):
    company: Company
    membership: CompanyMembership


class CompanySummaryListResponse(BaseModel):
    items: list[CompanySummary] = Field(default_factory=list)


class CompanyMemberListResponse(BaseModel):
    items: list[CompanyMembership] = Field(default_factory=list)
