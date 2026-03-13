from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("ai_execution_logs")


def create_log(data: dict[str, Any]) -> dict[str, Any]:
    ref = _collection().document()
    payload = dict(data or {})
    payload["id"] = ref.id
    ref.set(payload, merge=False)
    return payload


def list_logs_by_session(session_id: str, limit: int = 500) -> list[dict[str, Any]]:
    if not session_id:
        return []
    query = _collection().where("sessionId", "==", session_id).limit(max(1, min(int(limit), 2000)))
    items: list[dict[str, Any]] = []
    for snap in query.stream():
        data = snap.to_dict() or {}
        data.setdefault("id", snap.id)
        items.append(data)
    return items
