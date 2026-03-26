from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from ..firebase_admin import get_firestore_client
from ..repositories import user_repository
from ..schemas import UserProfile, UserProfileUpdateRequest

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


def health(check_db: bool = False):
    payload = {"ok": True, "time": _now_iso()}
    if not check_db:
        return payload

    try:
        # Use a lightweight read to force a real Firestore RPC instead of only creating the client.
        get_firestore_client().collection("_healthcheck").limit(1).get()
        payload["firestore"] = {"checked": True, "ok": True}
    except Exception:
        logger.exception("Firestore health check failed")
        payload["ok"] = False
        payload["firestore"] = {"checked": True, "ok": False, "error": "firestore_unavailable"}
    return payload


def _resolve_name(user: dict, data: dict | None = None) -> str:
    stored = data or {}
    return (
        stored.get("name")
        or stored.get("displayName")
        or user.get("name")
        or user.get("displayName")
        or user.get("email", "Usuario").split("@")[0]
    )


def _resolve_avatar(user: dict, data: dict | None = None) -> str | None:
    stored = data or {}
    return (
        stored.get("avatar")
        or stored.get("photoURL")
        or user.get("photoURL")
        or user.get("picture")
    )


def _merge_user_profile_defaults(user: dict, data: dict | None = None) -> dict:
    merged = dict(data or {})
    now = _now_iso()
    name = _resolve_name(user, merged)
    avatar = _resolve_avatar(user, merged)

    merged.setdefault("uid", user["uid"])
    merged["name"] = name
    merged.setdefault("displayName", name)
    merged.setdefault("email", user.get("email", ""))
    if avatar:
        merged.setdefault("avatar", avatar)
        merged.setdefault("photoURL", avatar)
    merged.setdefault("plan", os.environ.get("DEFAULT_PLAN", "free"))
    merged["credits"] = int(merged.get("credits", _initial_credits()))
    merged.setdefault("createdAt", now)
    merged.setdefault("updatedAt", merged.get("createdAt") or now)
    return merged


def me(user):
    logger.info("GET /me called uid=%s email=%s", user.get("uid"), user.get("email"))
    try:
        data = user_repository.get_user(user["uid"])
        if not data:
            profile = _merge_user_profile_defaults(user)
            user_repository.upsert_user(user["uid"], profile, merge=True)
            return UserProfile(**profile)

        data = _merge_user_profile_defaults(user, data)
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


def update_me(user: dict, payload: UserProfileUpdateRequest) -> UserProfile:
    logger.info("PATCH /me called uid=%s email=%s", user.get("uid"), user.get("email"))
    existing = user_repository.get_user(user["uid"]) or {}
    now = _now_iso()
    profile = _merge_user_profile_defaults(
        {**user, "name": payload.name, "displayName": payload.name},
        {
            **existing,
            "name": payload.name,
            "displayName": payload.name,
            "updatedAt": now,
            "createdAt": existing.get("createdAt") or now,
        },
    )
    profile["updatedAt"] = now
    user_repository.upsert_user(user["uid"], profile, merge=True)
    return me({**user, "name": payload.name, "displayName": payload.name})
