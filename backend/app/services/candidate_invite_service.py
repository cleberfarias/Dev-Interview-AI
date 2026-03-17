from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from ..repositories import candidate_invite_repository
from ..schemas.candidate_invite import (
    CandidateInvite,
    CandidateInviteCreateRequest,
    CandidateInviteListResponse,
)
from . import company_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_invite_id() -> str:
    return f"inv_{uuid4().hex[:12]}"


def _new_token() -> str:
    return uuid4().hex


def create_invite(*, user: dict, company_id: str, payload: CandidateInviteCreateRequest) -> CandidateInvite:
    company_service.get_company_access_context(user=user, company_id=company_id, required_roles={"admin", "recruiter"})
    ts = _now_iso()
    invite_id = _new_invite_id()
    token = _new_token()
    saved = candidate_invite_repository.upsert_invite(
        invite_id,
        {
            "id": invite_id,
            "companyId": company_id,
            "templateId": payload.templateId,
            "candidateName": payload.candidateName.strip(),
            "candidateEmail": str(payload.candidateEmail),
            "status": "sent",
            "token": token,
            "createdAt": ts,
            "updatedAt": ts,
        },
        merge=False,
    )
    return CandidateInvite(**saved)


def list_invites(*, user: dict, company_id: str) -> CandidateInviteListResponse:
    company_service.get_company_access_context(user=user, company_id=company_id)
    items = candidate_invite_repository.list_invites(company_id)
    return CandidateInviteListResponse(items=[CandidateInvite(**item) for item in items])


def get_invite_by_token(token: str) -> CandidateInvite | None:
    raw = candidate_invite_repository.get_invite_by_token(token)
    if not raw:
        return None
    return CandidateInvite(**raw)
