from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("job_analyses")


def create_job_analysis(data: dict[str, Any]) -> dict[str, Any]:
    ref = _collection().document()
    ref.set(data, merge=False)
    snap = ref.get()
    payload = snap.to_dict() or dict(data)
    payload["id"] = ref.id
    return payload


def list_job_analyses(*, user_id: str, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    safe_offset = max(0, int(offset))
    safe_limit = max(1, min(int(limit), 50))

    query = (
        _collection()
        .where("userId", "==", user_id)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
    )
    docs = list(query.stream())
    total = len(docs)
    selected = docs[safe_offset : safe_offset + safe_limit]

    items: list[dict[str, Any]] = []
    for snap in selected:
        payload = snap.to_dict() or {}
        payload["id"] = snap.id
        items.append(payload)

    next_offset = safe_offset + len(items)
    has_more = next_offset < total
    return {
        "items": items,
        "total": total,
        "offset": safe_offset,
        "limit": safe_limit,
        "hasMore": has_more,
        "nextOffset": next_offset if has_more else None,
    }
