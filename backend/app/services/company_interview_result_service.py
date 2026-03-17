from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from ..repositories import company_interview_result_repository
from ..schemas.company_interview_result import (
    CompanyInterviewResult,
    CompanyInterviewResultCreateRequest,
    CompanyInterviewResultListResponse,
)
from . import company_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_result_id() -> str:
    return f"res_{uuid4().hex[:12]}"


def create_result(*, user: dict, company_id: str, payload: CompanyInterviewResultCreateRequest) -> CompanyInterviewResult:
    company_service.get_company_access_context(user=user, company_id=company_id, required_roles={"admin", "recruiter"})
    ts = _now_iso()
    result_id = _new_result_id()
    saved = company_interview_result_repository.upsert_result(
        result_id,
        {
            "id": result_id,
            "companyId": company_id,
            "templateId": payload.templateId,
            "candidateName": payload.candidateName,
            "technicalScore": float(payload.technicalScore),
            "communicationScore": float(payload.communicationScore),
            "behavioralScore": float(payload.behavioralScore),
            "overallScore": float(payload.overallScore),
            "recommendation": payload.recommendation or "",
            "createdAt": ts,
            "updatedAt": ts,
        },
        merge=False,
    )
    return CompanyInterviewResult(**saved)


def list_results(*, user: dict, company_id: str) -> CompanyInterviewResultListResponse:
    company_service.get_company_access_context(user=user, company_id=company_id)
    items = company_interview_result_repository.list_results(company_id)
    return CompanyInterviewResultListResponse(items=[CompanyInterviewResult(**item) for item in items])
