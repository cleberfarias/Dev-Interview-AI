from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("candidate_profiles")


def get_profile(user_id: str) -> dict[str, Any] | None:
    snap = _collection().document(user_id).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def upsert_profile(user_id: str, data: dict[str, Any], merge: bool = True) -> dict[str, Any]:
    ref = _collection().document(user_id)
    ref.set(data, merge=merge)
    snap = ref.get()
    return snap.to_dict() or data


def record_analysis_trace(
    *,
    user_id: str,
    kind: str,
    trace: dict[str, Any],
    now_iso: str,
    max_items: int = 40,
) -> dict[str, Any]:
    db = get_firestore_client()
    ref = _collection().document(user_id)
    kind_key = "lastResumeAnalysisTrace" if kind == "resume" else "lastJobAnalysisTrace"
    event = {
        "kind": kind,
        "source": str(trace.get("source") or "heuristic"),
        "aiProvider": trace.get("aiProvider"),
        "aiModel": trace.get("aiModel"),
        "createdAt": now_iso,
    }

    @firestore.transactional
    def _tx_update(transaction):
        snap = ref.get(transaction=transaction)
        current = snap.to_dict() if snap.exists else {}
        audit = current.get("analysisAudit")
        if not isinstance(audit, list):
            audit = []
        next_audit = [event]
        for item in audit:
            if isinstance(item, dict):
                next_audit.append(item)
            if len(next_audit) >= max_items:
                break

        patch = {
            "userId": user_id,
            kind_key: {
                "source": str(trace.get("source") or "heuristic"),
                "aiProvider": trace.get("aiProvider"),
                "aiModel": trace.get("aiModel"),
            },
            "analysisAudit": next_audit,
            "updatedAt": now_iso,
        }
        if not current.get("createdAt"):
            patch["createdAt"] = now_iso

        transaction.set(ref, patch, merge=True)

    _tx_update(db.transaction())
    saved = ref.get()
    return saved.to_dict() or {}
