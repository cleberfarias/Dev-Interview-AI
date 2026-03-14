from __future__ import annotations

from fastapi import APIRouter, Depends

from ..avatar_engine import avatar_controller
from ..firebase_admin import get_current_user
from ..request_context import scoped_context
from ..schemas import AvatarRespondRequest, AvatarResponse

router = APIRouter()


@router.post("/avatar/respond", response_model=AvatarResponse)
def avatar_respond(payload: AvatarRespondRequest, user=Depends(get_current_user)):
    with scoped_context(user_id=str(user.get("uid") or ""), session_id=payload.sessionId):
        data = avatar_controller.generate_avatar_response(
            text=payload.text,
            emotion=payload.emotion,
            language=payload.language,
            voice=payload.voice,
        )
    return AvatarResponse(**data)
