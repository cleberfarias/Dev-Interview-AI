from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def _collection(user_id: str):
    db = get_firestore_client()
    return db.collection("users").document(user_id).collection("knowledge_index")


def list_documents(user_id: str, limit: int = 80) -> list[dict[str, Any]]:
    if not user_id:
        return []
    items: list[dict[str, Any]] = []
    query = _collection(user_id).limit(max(1, int(limit)))
    for doc in query.stream():
        data = doc.to_dict() or {}
        data.setdefault("id", doc.id)
        items.append(data)
    return items


def upsert_documents(user_id: str, documents: list[dict[str, Any]]) -> None:
    if not user_id:
        return
    collection = _collection(user_id)
    for item in documents:
        if not isinstance(item, dict):
            continue
        doc_id = str(item.get("id") or "").strip()
        if not doc_id:
            continue
        collection.document(doc_id).set(item, merge=True)


def delete_missing_documents(user_id: str, keep_ids: list[str]) -> None:
    if not user_id:
        return
    keep = {str(item or "").strip() for item in keep_ids if str(item or "").strip()}
    collection = _collection(user_id)
    for doc in collection.stream():
        if doc.id in keep:
            continue
        doc.reference.delete()
