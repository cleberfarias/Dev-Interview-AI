from __future__ import annotations

from typing import Any

from google.cloud import firestore

from ..firebase_admin import get_firestore_client


def create_pending_session(
    *,
    uid: str,
    config: dict[str, Any],
    user_seed: dict[str, Any],
    initial_credits: int,
    now_iso: str,
    analysis_trace_snapshot: dict[str, Any] | None = None,
) -> tuple[str, int]:
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)

    @firestore.transactional
    def _tx_create(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            transaction.set(user_ref, user_seed, merge=True)
            credits = int(initial_credits)
        else:
            credits = int((snap.to_dict() or {}).get("credits", 0))

        session_ref = db.collection("sessions").document()
        session_data = {
            "uid": uid,
            "status": "started",
            "plan_status": "pending",
            "config": config,
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        if analysis_trace_snapshot:
            session_data["analysisTraceSnapshot"] = analysis_trace_snapshot
        transaction.set(
            session_ref,
            session_data,
        )
        return session_ref.id, credits

    return _tx_create(db.transaction())


def get_session(session_id: str) -> dict[str, Any] | None:
    snap = get_firestore_client().collection("sessions").document(session_id).get()
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def upsert_session(session_id: str, data: dict[str, Any], merge: bool = True) -> None:
    get_firestore_client().collection("sessions").document(session_id).set(data, merge=merge)


def merge_answer_communication_analysis(session_id: str, answer_id: str, data: dict[str, Any]) -> None:
    if not session_id or not answer_id:
        return
    safe_answer_id = str(answer_id).strip().replace("/", "_").replace("\\", "_").replace(".", "_")
    payload = {
        "communicationAnalysis": {
            "answers": {
                safe_answer_id: dict(data or {}),
            }
        }
    }
    get_firestore_client().collection("sessions").document(session_id).set(payload, merge=True)


def delete_session(session_id: str) -> None:
    get_firestore_client().collection("sessions").document(session_id).delete()


def count_sessions(status: str | None = None) -> int:
    query = get_firestore_client().collection("sessions")
    if status:
        query = query.where("status", "==", status)
    return sum(1 for _ in query.stream())
