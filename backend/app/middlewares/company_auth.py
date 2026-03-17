from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, Request

from ..firebase_admin import get_current_user
from ..services import company_service


def _resolve_company_id(request: Request, x_company_id: str | None = Header(default=None)) -> str:
    company_id = (
        request.path_params.get("company_id")
        or request.query_params.get("companyId")
        or x_company_id
        or ""
    ).strip()
    if not company_id:
        raise HTTPException(status_code=400, detail="companyId obrigatorio")
    return company_id


def require_company_access(*required_roles: str) -> Callable:
    roles = {role.strip() for role in required_roles if str(role).strip()}

    def _dependency(
        request: Request,
        user=Depends(get_current_user),
        x_company_id: str | None = Header(default=None),
    ):
        company_id = _resolve_company_id(request, x_company_id=x_company_id)
        return company_service.get_company_access_context(
            user=user,
            company_id=company_id,
            required_roles=roles or None,
        )

    return _dependency
