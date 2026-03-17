from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _templates_collection():
    db = get_firestore_client()
    return db.collection("company_interview_templates")


def get_template(template_id: str) -> dict[str, Any] | None:
    snap = _templates_collection().document(template_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data.setdefault("id", template_id)
    return data


def upsert_template(template_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    _templates_collection().document(template_id).set(data, merge=merge)
    saved = get_template(template_id) or dict(data)
    saved.setdefault("id", template_id)
    return saved


def list_templates(company_id: str, limit: int = 100) -> list[dict[str, Any]]:
    query = (
        _templates_collection()
        .where("companyId", "==", company_id)
        .order_by("createdAt", direction=firestore.Query.ASCENDING)
        .limit(limit)
    )
    return [doc.to_dict() or {} for doc in query.stream()]


def delete_template(template_id: str) -> None:
    _templates_collection().document(template_id).delete()
