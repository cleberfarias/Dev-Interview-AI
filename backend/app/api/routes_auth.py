from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import UserProfile
from ..services import profile_service

router = APIRouter()


@router.get("/auth/me", response_model=UserProfile)
def auth_me(user=Depends(get_current_user)):
    return profile_service.me(user)
