from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


_DOC_ID = "global"


def _doc():
    return get_firestore_client().collection("product_metrics").document(_DOC_ID)


def get_metrics() -> dict[str, Any]:
    snap = _doc().get()
    if not snap.exists:
        return {}
    return snap.to_dict() or {}


def upsert_metrics(data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    ref = _doc()
    ref.set(dict(data or {}), merge=merge)
    saved = ref.get()
    return saved.to_dict() or {}
