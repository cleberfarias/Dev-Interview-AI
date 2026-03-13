from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("interview_metrics")


def upsert_metrics(session_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    ref = _collection().document(session_id)
    payload = dict(data or {})
    payload.setdefault("sessionId", session_id)
    ref.set(payload, merge=merge)
    saved = ref.get()
    return saved.to_dict() or payload


def get_metrics(session_id: str) -> dict[str, Any] | None:
    snap = _collection().document(session_id).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def list_metrics(limit: int = 2000) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 5000))
    items: list[dict[str, Any]] = []
    for snap in _collection().limit(safe_limit).stream():
        payload = snap.to_dict() or {}
        payload.setdefault("sessionId", snap.id)
        items.append(payload)
    return items
