from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("candidate_memory")


def get_memory(user_id: str) -> dict[str, Any] | None:
    snap = _collection().document(user_id).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def upsert_memory(user_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    ref = _collection().document(user_id)
    payload = dict(data or {})
    payload.setdefault("userId", user_id)
    ref.set(payload, merge=merge)
    saved = ref.get()
    return saved.to_dict() or payload
