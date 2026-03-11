from __future__ import annotations

from datetime import datetime, timezone

from ..repositories import candidate_profile_repository
from ..schemas import CandidateProfile, CandidateProfileAuditPageResponse, CandidateProfileUpsertRequest


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
            analysisAudit=[],
            createdAt=None,
            updatedAt=None,
        )
    data.setdefault("userId", uid)
    data.setdefault("analysisAudit", [])
    data.setdefault("lastResumeAnalysisTrace", None)
    data.setdefault("lastJobAnalysisTrace", None)
    return CandidateProfile(**data)


def upsert_candidate_profile(user: dict, payload: CandidateProfileUpsertRequest) -> CandidateProfile:
    uid = user["uid"]
    current = candidate_profile_repository.get_profile(uid) or {}
    created_at = current.get("createdAt") or _now_iso()
    updated_at = _now_iso()

    data = {
        "userId": uid,
        "targetRole": payload.targetRole,
        "experienceLevel": payload.experienceLevel,
        "primarySkills": payload.primarySkills,
        "weakSkills": payload.weakSkills,
        "resumeSummary": payload.resumeSummary,
        "jobDescription": payload.jobDescription,
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
