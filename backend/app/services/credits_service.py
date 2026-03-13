from __future__ import annotations

import os

from fastapi import HTTPException

from . import usage_policy_service


def dev_add_credits(amount: int, user):
    if os.environ.get("ALLOW_DEV_CREDITS", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Desabilitado")
    if amount <= 0 or amount > 1000:
        raise HTTPException(status_code=400, detail="amount invalido")

    total = usage_policy_service.add_credits(user["uid"], int(amount))
    return {"credits": total}
