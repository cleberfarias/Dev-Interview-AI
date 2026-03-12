from __future__ import annotations

from datetime import datetime, timezone

from ..repositories import candidate_profile_repository, job_analysis_repository, resume_analysis_repository
from ..schemas import (
    CandidateProfile,
    CandidateProfileAuditPageResponse,
    CandidateProfileUpsertRequest,
    JobAnalysisPageResponse,
    ResumeAnalysisPageResponse,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        key = raw.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(raw)
    return out


def _merge_text(current: str | None, incoming: str | None) -> str | None:
    if incoming is None:
        return current
    cleaned = str(incoming).strip()
    if not cleaned:
        return current
    return cleaned


def _merge_list(current: list[str] | None, incoming: list[str] | None) -> list[str]:
    base = current if isinstance(current, list) else []
    if not isinstance(incoming, list):
        return base
    cleaned = [item.strip() for item in incoming if isinstance(item, str) and item.strip()]
    if not cleaned:
        return base
    return _dedupe_preserve(cleaned)


def get_candidate_profile(user: dict) -> CandidateProfile:
    uid = user["uid"]
    data = candidate_profile_repository.get_profile(uid)
    if not data:
        return CandidateProfile(
            userId=uid,
            targetRole=None,
            experienceLevel=None,
            primarySkills=[],
            weakSkills=[],
            resumeSummary=None,
            jobDescription=None,
            lastResumeAnalysisTrace=None,
            lastJobAnalysisTrace=None,
            lastResumeAnalysisId=None,
            lastJobAnalysisId=None,
            lastMatchScore=None,
            recentResumeAnalysisIds=[],
            recentJobAnalysisIds=[],
            analysisAudit=[],
            createdAt=None,
            updatedAt=None,
        )
    data.setdefault("userId", uid)
    data.setdefault("analysisAudit", [])
    data.setdefault("lastResumeAnalysisTrace", None)
    data.setdefault("lastJobAnalysisTrace", None)
    data.setdefault("lastResumeAnalysisId", None)
    data.setdefault("lastJobAnalysisId", None)
    data.setdefault("lastMatchScore", None)
    data.setdefault("recentResumeAnalysisIds", [])
    data.setdefault("recentJobAnalysisIds", [])
    return CandidateProfile(**data)


def upsert_candidate_profile(user: dict, payload: CandidateProfileUpsertRequest) -> CandidateProfile:
    uid = user["uid"]
    current = candidate_profile_repository.get_profile(uid) or {}
    created_at = current.get("createdAt") or _now_iso()
    updated_at = _now_iso()

    data = {
        "userId": uid,
        "targetRole": _merge_text(current.get("targetRole"), payload.targetRole),
        "experienceLevel": _merge_text(current.get("experienceLevel"), payload.experienceLevel),
        "primarySkills": _merge_list(current.get("primarySkills"), payload.primarySkills),
        "weakSkills": _merge_list(current.get("weakSkills"), payload.weakSkills),
        "resumeSummary": _merge_text(current.get("resumeSummary"), payload.resumeSummary),
        "jobDescription": _merge_text(current.get("jobDescription"), payload.jobDescription),
        "createdAt": created_at,
        "updatedAt": updated_at,
    }
    saved = candidate_profile_repository.upsert_profile(uid, data, merge=True)
    saved.setdefault("userId", uid)
    return CandidateProfile(**saved)


def list_candidate_profile_audit(user: dict, limit: int = 20, offset: int = 0) -> CandidateProfileAuditPageResponse:
    uid = user["uid"]
    data = candidate_profile_repository.get_profile(uid) or {}
    audit_raw = data.get("analysisAudit")
    if not isinstance(audit_raw, list):
        audit_raw = []

    safe_offset = max(0, int(offset))
    safe_limit = max(1, min(int(limit), 50))

    normalized = [item for item in audit_raw if isinstance(item, dict)]
    total = len(normalized)
    items = normalized[safe_offset : safe_offset + safe_limit]
    next_offset = safe_offset + len(items)
    has_more = next_offset < total

    return CandidateProfileAuditPageResponse(
        items=items,
        total=total,
        offset=safe_offset,
        limit=safe_limit,
        hasMore=has_more,
        nextOffset=next_offset if has_more else None,
    )


def list_resume_analyses(user: dict, limit: int = 20, offset: int = 0) -> ResumeAnalysisPageResponse:
    uid = user["uid"]
    page = resume_analysis_repository.list_resume_analyses(user_id=uid, limit=limit, offset=offset)
    return ResumeAnalysisPageResponse(**page)


def list_job_analyses(user: dict, limit: int = 20, offset: int = 0) -> JobAnalysisPageResponse:
    uid = user["uid"]
    page = job_analysis_repository.list_job_analyses(user_id=uid, limit=limit, offset=offset)
    return JobAnalysisPageResponse(**page)
