from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _users_collection():
    db = get_firestore_client()
    return db.collection("users")


def get_user(uid: str) -> dict | None:
    snap = _users_collection().document(uid).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def upsert_user(uid: str, data: dict[str, Any], merge: bool = True) -> None:
    _users_collection().document(uid).set(data, merge=merge)


def list_user_interviews(uid: str, limit: int = 20) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    query = (
        _users_collection()
        .document(uid)
        .collection("interviews")
        .order_by("date", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    for doc in query.stream():
        items.append(doc.to_dict() or {})
    return items


def get_credits(uid: str, default_credits: int) -> int:
    data = get_user(uid)
    if not data:
        return int(default_credits)
    return int(data.get("credits", 0))


def debit_credits(
    uid: str,
    amount: int,
    *,
    initial_credits: int,
    default_plan: str,
    now_iso: str,
) -> int:
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)

    @firestore.transactional
    def _tx_charge(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            transaction.set(
                user_ref,
                {
                    "uid": uid,
                    "displayName": uid,
                    "email": "",
                    "plan": default_plan,
                    "credits": int(initial_credits),
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                },
                merge=True,
            )
            credits = int(initial_credits)
        else:
            credits = int((snap.to_dict() or {}).get("credits", 0))

        if credits < amount:
            raise HTTPException(status_code=402, detail="Creditos insuficientes")

        new_credits = credits - int(amount)
        transaction.update(user_ref, {"credits": new_credits, "updatedAt": now_iso})
        return new_credits

    return _tx_charge(db.transaction())


def add_credits(uid: str, amount: int, now_iso: str) -> int:
    ref = _users_collection().document(uid)
    snap = ref.get()
    current = int((snap.to_dict() or {}).get("credits", 0)) if snap.exists else 0
    new_total = current + int(amount)
    ref.set({"credits": new_total, "updatedAt": now_iso}, merge=True)
    return new_total
