from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from ..repositories import company_repository
from ..schemas.company import (
    Company,
    CompanyAccessContext,
    CompanyCreateRequest,
    CompanyMemberListResponse,
    CompanyMembership,
    CompanyMembershipUpsertRequest,
    CompanySummary,
    CompanySummaryListResponse,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_company_id() -> str:
    return f"cmp_{uuid4().hex[:12]}"


def create_company(user: dict, payload: CompanyCreateRequest) -> CompanyAccessContext:
    ts = _now_iso()
    company_id = _new_company_id()
    company = company_repository.upsert_company(
        company_id,
        {
            "id": company_id,
            "name": payload.name.strip(),
            "plan": payload.plan,
            "createdAt": ts,
            "updatedAt": ts,
        },
        merge=False,
    )
    membership = company_repository.upsert_membership(
        company_id,
        user["uid"],
        {
            "userId": user["uid"],
            "companyId": company_id,
            "role": "admin",
            "createdAt": ts,
            "updatedAt": ts,
        },
        merge=False,
    )
    return CompanyAccessContext(company=Company(**company), membership=CompanyMembership(**membership))


def list_user_companies(user: dict) -> CompanySummaryListResponse:
    memberships = company_repository.list_user_memberships(user["uid"])
    items: list[CompanySummary] = []
    for raw_membership in memberships:
        company_id = str(raw_membership.get("companyId") or "").strip()
        if not company_id:
            continue
        company = company_repository.get_company(company_id)
        if not company:
            continue
        items.append(
            CompanySummary(
                company=Company(**company),
                membership=CompanyMembership(**raw_membership),
            )
        )
    return CompanySummaryListResponse(items=items)


def get_company_access_context(
    *,
    user: dict,
    company_id: str,
    required_roles: set[str] | None = None,
) -> CompanyAccessContext:
    company = company_repository.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa nao encontrada")

    membership = company_repository.get_membership(company_id, user["uid"])
    if not membership:
        raise HTTPException(status_code=403, detail="Acesso negado para esta empresa")

    role = str(membership.get("role") or "").strip()
    if required_roles and role not in required_roles:
        raise HTTPException(status_code=403, detail="Permissao insuficiente para esta empresa")

    return CompanyAccessContext(company=Company(**company), membership=CompanyMembership(**membership))


def list_company_members(user: dict, company_id: str) -> CompanyMemberListResponse:
    access = get_company_access_context(user=user, company_id=company_id)
    del access
    memberships = company_repository.list_company_memberships(company_id)
    return CompanyMemberListResponse(items=[CompanyMembership(**item) for item in memberships])


def upsert_company_member(
    *,
    actor_user: dict,
    company_id: str,
    target_user_id: str,
    payload: CompanyMembershipUpsertRequest,
) -> CompanyMembership:
    access = get_company_access_context(user=actor_user, company_id=company_id, required_roles={"admin"})
    if target_user_id == access.membership.userId and payload.role != "admin":
        raise HTTPException(status_code=400, detail="O admin criador nao pode remover o proprio papel de admin por esta rota")
    ts = _now_iso()
    current = company_repository.get_membership(company_id, target_user_id) or {}
    saved = company_repository.upsert_membership(
        company_id,
        target_user_id,
        {
            "userId": target_user_id,
            "companyId": company_id,
            "role": payload.role,
            "createdAt": current.get("createdAt") or ts,
            "updatedAt": ts,
        },
        merge=True,
    )
    return CompanyMembership(**saved)
