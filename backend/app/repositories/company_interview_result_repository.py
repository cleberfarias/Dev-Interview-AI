from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _results_collection():
    db = get_firestore_client()
    return db.collection("company_interview_results")


def get_result(result_id: str) -> dict[str, Any] | None:
    snap = _results_collection().document(result_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data.setdefault("id", result_id)
    return data


def upsert_result(result_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    _results_collection().document(result_id).set(data, merge=merge)
    saved = get_result(result_id) or dict(data)
    saved.setdefault("id", result_id)
    return saved


def list_results(company_id: str, limit: int = 200) -> list[dict[str, Any]]:
    query = (
        _results_collection()
        .where("companyId", "==", company_id)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    return [doc.to_dict() or {} for doc in query.stream()]
