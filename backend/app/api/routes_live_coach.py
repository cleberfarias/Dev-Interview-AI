from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from ..firebase_admin import get_current_user, verify_bearer_token
from ..schemas import LiveCoachProcessRequest, LiveCoachProcessResponse
from ..services import live_coach_service

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


@router.post("/live-coach/process", response_model=LiveCoachProcessResponse)
def process_live_coach(payload: LiveCoachProcessRequest, user=Depends(get_current_user)):
    return live_coach_service.process_audio_chunk(payload, user)


def _websocket_user(websocket: WebSocket) -> dict[str, Any]:
    auth_header = (websocket.headers.get("authorization") or "").strip()
    token_qs = (websocket.query_params.get("token") or "").strip()

    authorization = auth_header
    if not authorization and token_qs:
        authorization = f"Bearer {token_qs}"

    decoded = verify_bearer_token(authorization)
    uid = decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing uid")

    return {
        "uid": uid,
        "email": decoded.get("email", ""),
        "name": decoded.get("name"),
        "picture": decoded.get("picture"),
        "displayName": decoded.get("name"),
        "photoURL": decoded.get("picture"),
        "token": token_qs or None,
    }


@router.websocket("/live-coach/ws")
async def live_coach_ws(websocket: WebSocket):
    try:
        user = _websocket_user(websocket)
    except HTTPException:
        await websocket.close(code=4401)
        return
    except Exception:
        logger.exception("Live coach websocket auth failed")
        await websocket.close(code=1011)
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready"})

    while True:
        try:
            message = await websocket.receive_json()
        except WebSocketDisconnect:
            break
        except Exception:
            await websocket.send_json({"type": "error", "error": "invalid_json"})
            continue

        if not isinstance(message, dict):
            await websocket.send_json({"type": "error", "error": "invalid_message"})
            continue

        msg_type = str(message.get("type") or "process").strip().lower()
        request_id = str(message.get("requestId") or "").strip() or None

        if msg_type == "ping":
            await websocket.send_json({"type": "pong", "requestId": request_id})
            continue

        if msg_type != "process":
            await websocket.send_json(
                {
                    "type": "error",
                    "requestId": request_id,
                    "error": "unsupported_type",
                }
            )
            continue

        payload_data = message.get("payload")
        if not isinstance(payload_data, dict):
            await websocket.send_json(
                {
                    "type": "error",
                    "requestId": request_id,
                    "error": "invalid_payload",
                }
            )
            continue

        try:
            payload = LiveCoachProcessRequest(**payload_data)
        except ValidationError:
            await websocket.send_json(
                {
                    "type": "error",
                    "requestId": request_id,
                    "error": "invalid_payload",
                }
            )
            continue

        try:
            response = live_coach_service.process_audio_chunk(payload, user)
        except Exception:
            logger.exception("Live coach websocket processing failed")
            await websocket.send_json(
                {
                    "type": "error",
                    "requestId": request_id,
                    "error": "processing_failed",
                }
            )
            continue

        await websocket.send_json(
            {
                "type": "insight",
                "requestId": request_id,
                "payload": response.model_dump(),
            }
        )
