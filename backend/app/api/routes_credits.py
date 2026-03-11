from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..services import credits_service

router = APIRouter()


@router.post("/credits/dev-add")
def dev_add_credits(amount: int = 3, user=Depends(get_current_user)):
    return credits_service.dev_add_credits(amount, user)

