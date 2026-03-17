from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _companies_collection():
    db = get_firestore_client()
    return db.collection("companies")


def _memberships_collection():
    db = get_firestore_client()
    return db.collection("company_memberships")


def get_company(company_id: str) -> dict[str, Any] | None:
    snap = _companies_collection().document(company_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data.setdefault("id", company_id)
    return data


def upsert_company(company_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    _companies_collection().document(company_id).set(data, merge=merge)
    saved = get_company(company_id) or dict(data)
    saved.setdefault("id", company_id)
    return saved


def get_membership(company_id: str, user_id: str) -> dict[str, Any] | None:
    membership_id = build_membership_id(company_id, user_id)
    snap = _memberships_collection().document(membership_id).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def upsert_membership(company_id: str, user_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    membership_id = build_membership_id(company_id, user_id)
    _memberships_collection().document(membership_id).set(data, merge=merge)
    saved = get_membership(company_id, user_id) or dict(data)
    saved.setdefault("companyId", company_id)
    saved.setdefault("userId", user_id)
    return saved


def list_user_memberships(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    query = (
        _memberships_collection()
        .where("userId", "==", user_id)
        .order_by("createdAt", direction=firestore.Query.ASCENDING)
        .limit(limit)
    )
    return [doc.to_dict() or {} for doc in query.stream()]


def list_company_memberships(company_id: str, limit: int = 100) -> list[dict[str, Any]]:
    query = (
        _memberships_collection()
        .where("companyId", "==", company_id)
        .order_by("createdAt", direction=firestore.Query.ASCENDING)
        .limit(limit)
    )
    return [doc.to_dict() or {} for doc in query.stream()]


def build_membership_id(company_id: str, user_id: str) -> str:
    return f"{company_id}__{user_id}"
