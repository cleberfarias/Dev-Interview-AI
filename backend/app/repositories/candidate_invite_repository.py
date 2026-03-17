from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _invites_collection():
    db = get_firestore_client()
    return db.collection("company_candidate_invites")


def get_invite(invite_id: str) -> dict[str, Any] | None:
    snap = _invites_collection().document(invite_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data.setdefault("id", invite_id)
    return data


def upsert_invite(invite_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    _invites_collection().document(invite_id).set(data, merge=merge)
    saved = get_invite(invite_id) or dict(data)
    saved.setdefault("id", invite_id)
    return saved


def list_invites(company_id: str, limit: int = 200) -> list[dict[str, Any]]:
    query = (
        _invites_collection()
        .where("companyId", "==", company_id)
        .order_by("createdAt")
        .limit(limit)
    )
    return [doc.to_dict() or {} for doc in query.stream()]


def get_invite_by_token(token: str) -> dict[str, Any] | None:
    query = _invites_collection().where("token", "==", token).limit(1)
    docs = list(query.stream())
    if not docs:
        return None
    data = docs[0].to_dict() or {}
    data.setdefault("id", docs[0].id)
    return data
