from __future__ import annotations

import logging

from fastapi import APIRouter, Request, status

from ..schemas import ClientErrorLogRequest

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


@router.post("/telemetry/client-error", status_code=status.HTTP_202_ACCEPTED)
async def log_client_error(payload: ClientErrorLogRequest, request: Request):
    extra = {
        "clientError": payload.model_dump(exclude_none=True),
        "origin": request.headers.get("origin"),
        "referer": request.headers.get("referer"),
        "remoteIp": getattr(request.client, "host", None),
        "telemetryType": "frontend_error",
        "userAgent": request.headers.get("user-agent"),
    }

    if payload.level == "info":
        logger.info("frontend_client_error", extra=extra)
    elif payload.level == "warning":
        logger.warning("frontend_client_error", extra=extra)
    else:
        logger.error("frontend_client_error", extra=extra)

    return {"ok": True}
