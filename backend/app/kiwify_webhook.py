from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from google.api_core.exceptions import AlreadyExists
from google.cloud import firestore

from .firebase_admin import get_firestore_client

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _allow_unsecured_webhook() -> bool:
    value = (os.environ.get("ALLOW_UNSECURED_KIWIFY_WEBHOOK") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _require_kiwify_auth(request: Request, require_token_config: bool = False) -> None:
    token_required = (os.environ.get("KIWIFY_WEBHOOK_TOKEN") or "").strip()
    header_token = request.headers.get("x-kiwify-token") or request.headers.get("X-Kiwify-Token")
    query_token = request.query_params.get("token")
    provided_token = (header_token or query_token or "").strip()

    if token_required:
        if provided_token != token_required:
            raise HTTPException(status_code=401, detail="Invalid webhook token")
        return

    if require_token_config or not _allow_unsecured_webhook():
        raise HTTPException(status_code=503, detail="Webhook auth not configured")


def _get_nested(d: dict, path: str):
    cur = d
    for key in path.split("."):
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def _extract_email(payload: dict) -> Optional[str]:
    candidates = [
        "email",
        "customer.email",
        "buyer.email",
        "client.email",
        "user.email",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and "@" in val:
            return val.strip().lower()
    return None


def _extract_product_key(payload: dict) -> Optional[str]:
    candidates = [
        "product_id",
        "product.id",
        "product",
        "product_name",
        "product.name",
        "offer.name",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _extract_event_id(payload: dict) -> Optional[str]:
    candidates = [
        "transaction_id",
        "order_id",
        "id",
        "event_id",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, (int, float)):
            return str(val)
    return None


def _is_approved(payload: dict) -> bool:
    event = str(payload.get("event") or payload.get("trigger") or payload.get("type") or "").lower()
    status = str(payload.get("status") or payload.get("payment_status") or "").lower()
    approved = {"compra_aprovada", "approved", "paid", "payment_approved", "payment_confirmed"}
    return event in approved or status in approved


def _load_kiwify_mapping() -> dict:
    raw = os.environ.get("KIWIFY_PRODUCT_CREDITS", "").strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        logger.warning("Invalid KIWIFY_PRODUCT_CREDITS JSON")
        return {}


def _map_credits(product_key: Optional[str], mapping: dict) -> Optional[int]:
    if not product_key:
        return None
    if product_key in mapping:
        return int(mapping[product_key])
    for key, value in mapping.items():
        if isinstance(key, str) and key.lower() == product_key.lower():
            return int(value)
    return None


def _reserve_event(ledger_ref, payload: dict, email: str, product_key: Optional[str], credits: int) -> bool:
    try:
        ledger_ref.create(
            {
                "email": email,
                "credits": int(credits),
                "product": product_key,
                "status": "processing",
                "createdAt": _now_iso(),
                "payload": payload,
            }
        )
        return True
    except AlreadyExists:
        return False


async def _handle_kiwify_payload(payload: dict):
    if not _is_approved(payload):
        return {"ok": True, "ignored": "not_approved"}

    email = _extract_email(payload)
    if not email:
        return {"ok": True, "ignored": "email_not_found"}

    product_key = _extract_product_key(payload)
    mapping = _load_kiwify_mapping()
    credits = _map_credits(product_key, mapping)
    if not credits:
        return {"ok": True, "ignored": "product_not_mapped"}

    event_id = _extract_event_id(payload)
    if not event_id:
        return {"ok": True, "ignored": "missing_transaction_id"}

    db = get_firestore_client()
    ledger_ref = db.collection("credits_ledger").document(event_id)
    if not _reserve_event(ledger_ref, payload, email, product_key, credits):
        return {"ok": True, "ignored": "duplicate"}

    user_query = db.collection("users").where("email", "==", email).limit(1).get()
    if not user_query:
        ledger_ref.set({"status": "user_not_found", "updatedAt": _now_iso()}, merge=True)
        return {"ok": True, "ignored": "user_not_found"}

    try:
        user_ref = user_query[0].reference
        user_ref.set({"credits": firestore.Increment(int(credits)), "updatedAt": _now_iso()}, merge=True)
    except Exception:
        ledger_ref.set({"status": "credit_failed", "updatedAt": _now_iso()}, merge=True)
        raise

    ledger_ref.set({"status": "credited", "updatedAt": _now_iso()}, merge=True)
    return {"ok": True, "credited": int(credits)}


@router.post("/webhooks/kiwify")
async def kiwify_webhook(request: Request):
    _require_kiwify_auth(request, require_token_config=False)

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    return await _handle_kiwify_payload(payload)


@router.post("/webhooks/kiwify/test")
async def kiwify_webhook_test(request: Request):
    if (os.environ.get("ALLOW_KIWIFY_TEST_WEBHOOK") or "").strip().lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")

    _require_kiwify_auth(request, require_token_config=True)

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    payload.setdefault("event", "compra_aprovada")
    return await _handle_kiwify_payload(payload)
