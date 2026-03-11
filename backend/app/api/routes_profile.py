from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..firebase_admin import get_current_user
from ..schemas import CandidateProfile, CandidateProfileAuditPageResponse, CandidateProfileUpsertRequest, UserProfile
from ..services import candidate_profile_service, profile_service

router = APIRouter()


@router.get("/health")
def health():
    return profile_service.health()


@router.get("/me", response_model=UserProfile)
def me(user=Depends(get_current_user)):
    return profile_service.me(user)


@router.get("/profile/candidate", response_model=CandidateProfile)
def get_candidate_profile(user=Depends(get_current_user)):
    return candidate_profile_service.get_candidate_profile(user)


@router.put("/profile/candidate", response_model=CandidateProfile)
def put_candidate_profile(payload: CandidateProfileUpsertRequest, user=Depends(get_current_user)):
    return candidate_profile_service.upsert_candidate_profile(user, payload)


@router.get("/profile/candidate/audit", response_model=CandidateProfileAuditPageResponse)
def get_candidate_profile_audit(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_current_user),
):
    return candidate_profile_service.list_candidate_profile_audit(user, limit=limit, offset=offset)
