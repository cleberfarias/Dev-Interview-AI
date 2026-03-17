from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..middlewares.company_auth import require_company_access
from ..schemas.company import (
    CompanyAccessContext,
    CompanyCreateRequest,
    CompanyMemberListResponse,
    CompanyMembership,
    CompanyMembershipUpsertRequest,
    CompanySummaryListResponse,
)
from ..schemas.interview_template import (
    InterviewTemplate,
    InterviewTemplateCreateRequest,
    InterviewTemplateListResponse,
    InterviewTemplateUpdateRequest,
)
from ..schemas.candidate_invite import (
    CandidateInvite,
    CandidateInviteCreateRequest,
    CandidateInviteListResponse,
)
from ..schemas.company_interview_result import (
    CompanyInterviewResult,
    CompanyInterviewResultCreateRequest,
    CompanyInterviewResultListResponse,
)
from ..services import company_service, interview_template_service
from ..services import candidate_invite_service
from ..services import company_interview_result_service

router = APIRouter()


@router.post("/company", response_model=CompanyAccessContext)
def create_company(payload: CompanyCreateRequest, user=Depends(get_current_user)):
    return company_service.create_company(user, payload)


@router.get("/company/mine", response_model=CompanySummaryListResponse)
def list_my_companies(user=Depends(get_current_user)):
    return company_service.list_user_companies(user)


@router.get("/company/{company_id}", response_model=CompanyAccessContext)
def get_company(access=Depends(require_company_access())):
    return access


@router.get("/company/{company_id}/members", response_model=CompanyMemberListResponse)
def list_company_members(company_id: str, user=Depends(get_current_user)):
    return company_service.list_company_members(user, company_id)


@router.put("/company/{company_id}/members/{user_id}", response_model=CompanyMembership)
def upsert_company_member(
    company_id: str,
    user_id: str,
    payload: CompanyMembershipUpsertRequest,
    user=Depends(get_current_user),
):
    return company_service.upsert_company_member(
        actor_user=user,
        company_id=company_id,
        target_user_id=user_id,
        payload=payload,
    )


@router.post("/company/{company_id}/templates", response_model=InterviewTemplate)
def create_interview_template(
    company_id: str,
    payload: InterviewTemplateCreateRequest,
    user=Depends(get_current_user),
):
    return interview_template_service.create_template(user=user, company_id=company_id, payload=payload)


@router.get("/company/{company_id}/templates", response_model=InterviewTemplateListResponse)
def list_interview_templates(company_id: str, user=Depends(get_current_user)):
    return interview_template_service.list_templates(user=user, company_id=company_id)


@router.put("/company/{company_id}/templates/{template_id}", response_model=InterviewTemplate)
def update_interview_template(
    company_id: str,
    template_id: str,
    payload: InterviewTemplateUpdateRequest,
    user=Depends(get_current_user),
):
    return interview_template_service.update_template(
        user=user,
        company_id=company_id,
        template_id=template_id,
        payload=payload,
    )


@router.delete("/company/{company_id}/templates/{template_id}")
def delete_interview_template(company_id: str, template_id: str, user=Depends(get_current_user)):
    return interview_template_service.delete_template(user=user, company_id=company_id, template_id=template_id)


@router.post("/company/{company_id}/invites", response_model=CandidateInvite)
def create_candidate_invite(
    company_id: str,
    payload: CandidateInviteCreateRequest,
    user=Depends(get_current_user),
):
    return candidate_invite_service.create_invite(user=user, company_id=company_id, payload=payload)


@router.get("/company/{company_id}/invites", response_model=CandidateInviteListResponse)
def list_candidate_invites(company_id: str, user=Depends(get_current_user)):
    return candidate_invite_service.list_invites(user=user, company_id=company_id)


@router.post("/company/{company_id}/results", response_model=CompanyInterviewResult)
def create_company_result(
    company_id: str,
    payload: CompanyInterviewResultCreateRequest,
    user=Depends(get_current_user),
):
    return company_interview_result_service.create_result(user=user, company_id=company_id, payload=payload)


@router.get("/company/{company_id}/results", response_model=CompanyInterviewResultListResponse)
def list_company_results(company_id: str, user=Depends(get_current_user)):
    return company_interview_result_service.list_results(user=user, company_id=company_id)
