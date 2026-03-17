from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from ..repositories import interview_template_repository
from ..schemas.interview_template import (
    InterviewTemplate,
    InterviewTemplateCreateRequest,
    InterviewTemplateListResponse,
    InterviewTemplateUpdateRequest,
)
from . import company_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_template_id() -> str:
    return f"tpl_{uuid4().hex[:12]}"


def _clean_topics(items: list[str] | None) -> list[str]:
    values = items if isinstance(items, list) else []
    return [item.strip() for item in values if isinstance(item, str) and item.strip()]


def create_template(*, user: dict, company_id: str, payload: InterviewTemplateCreateRequest) -> InterviewTemplate:
    company_service.get_company_access_context(user=user, company_id=company_id, required_roles={"admin", "recruiter"})
    ts = _now_iso()
    template_id = _new_template_id()
    saved = interview_template_repository.upsert_template(
        template_id,
        {
            "id": template_id,
            "companyId": company_id,
            "name": payload.name.strip(),
            "seniority": payload.seniority.strip(),
            "topics": _clean_topics(payload.topics),
            "questionCount": payload.questionCount,
            "timeLimit": payload.timeLimit,
            "difficultyLevel": payload.difficultyLevel,
            "createdAt": ts,
            "updatedAt": ts,
        },
        merge=False,
    )
    return InterviewTemplate(**saved)


def list_templates(*, user: dict, company_id: str) -> InterviewTemplateListResponse:
    company_service.get_company_access_context(user=user, company_id=company_id)
    items = interview_template_repository.list_templates(company_id)
    return InterviewTemplateListResponse(items=[InterviewTemplate(**item) for item in items])


def update_template(
    *,
    user: dict,
    company_id: str,
    template_id: str,
    payload: InterviewTemplateUpdateRequest,
) -> InterviewTemplate:
    company_service.get_company_access_context(user=user, company_id=company_id, required_roles={"admin", "recruiter"})
    current = interview_template_repository.get_template(template_id)
    if not current or str(current.get("companyId") or "").strip() != company_id:
        raise HTTPException(status_code=404, detail="Template nao encontrado")

    saved = interview_template_repository.upsert_template(
        template_id,
        {
            "companyId": company_id,
            "name": payload.name.strip() if isinstance(payload.name, str) and payload.name.strip() else current.get("name"),
            "seniority": (
                payload.seniority.strip()
                if isinstance(payload.seniority, str) and payload.seniority.strip()
                else current.get("seniority")
            ),
            "topics": _clean_topics(payload.topics) if payload.topics is not None else current.get("topics") or [],
            "questionCount": payload.questionCount if payload.questionCount is not None else current.get("questionCount"),
            "timeLimit": payload.timeLimit if payload.timeLimit is not None else current.get("timeLimit"),
            "difficultyLevel": (
                payload.difficultyLevel if payload.difficultyLevel is not None else current.get("difficultyLevel", 3)
            ),
            "updatedAt": _now_iso(),
        },
        merge=True,
    )
    return InterviewTemplate(**saved)


def delete_template(*, user: dict, company_id: str, template_id: str) -> dict[str, bool]:
    company_service.get_company_access_context(user=user, company_id=company_id, required_roles={"admin", "recruiter"})
    current = interview_template_repository.get_template(template_id)
    if not current or str(current.get("companyId") or "").strip() != company_id:
        raise HTTPException(status_code=404, detail="Template nao encontrado")
    interview_template_repository.delete_template(template_id)
    return {"ok": True}
