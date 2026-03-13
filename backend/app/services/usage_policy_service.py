from __future__ import annotations

import os
from datetime import datetime, timezone

from ..repositories import user_repository


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)


def _initial_credits() -> int:
    return _env_int("FREE_TRIAL_CREDITS", _env_int("DEFAULT_CREDITS", 3))


def _default_plan() -> str:
    return os.environ.get("DEFAULT_PLAN", "free")


def get_user_credits(user_uid: str) -> int:
    return user_repository.get_credits(user_uid, _initial_credits())


def debit_credits(user_uid: str, amount: int = 1) -> int:
    return user_repository.debit_credits(
        user_uid,
        amount=amount,
        initial_credits=_initial_credits(),
        default_plan=_default_plan(),
        now_iso=_now_iso(),
    )


def add_credits(user_uid: str, amount: int) -> int:
    return user_repository.add_credits(user_uid, int(amount), _now_iso())

