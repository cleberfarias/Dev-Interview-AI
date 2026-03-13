from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from ..repositories import user_repository
from ..schemas import UserProfile

logger = logging.getLogger("uvicorn.error")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)


def _initial_credits() -> int:
    return _env_int("FREE_TRIAL_CREDITS", _env_int("DEFAULT_CREDITS", 3))


def health():
    return {"ok": True, "time": _now_iso()}


def me(user):
    logger.info("GET /me called uid=%s email=%s", user.get("uid"), user.get("email"))
    try:
        data = user_repository.get_user(user["uid"])
        if not data:
            profile = {
                "uid": user["uid"],
                "name": user.get("name") or user.get("email", "Usuario").split("@")[0],
                "displayName": user.get("displayName") or user.get("name") or user.get("email", "Usuario").split("@")[0],
                "email": user.get("email", ""),
                "avatar": user.get("picture"),
                "photoURL": user.get("photoURL") or user.get("picture"),
                "plan": os.environ.get("DEFAULT_PLAN", "free"),
                "credits": _initial_credits(),
                "createdAt": _now_iso(),
                "updatedAt": _now_iso(),
            }
            user_repository.upsert_user(user["uid"], profile, merge=True)
            return UserProfile(**profile)

        data.setdefault("uid", user["uid"])
        try:
            data["interviews"] = user_repository.list_user_interviews(user["uid"], limit=20)
        except Exception:
            data.setdefault("interviews", [])
        return UserProfile(**data)
    except Exception:
        logger.exception("GET /me failed; returning fallback profile")
        return UserProfile(
            uid=user["uid"],
            name=user.get("name") or user.get("email", "Usuario").split("@")[0],
            email=user.get("email", ""),
            avatar=user.get("picture"),
            credits=_initial_credits(),
            interviews=[],
        )
