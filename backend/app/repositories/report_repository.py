from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def save_user_interview_history(
    *,
    uid: str,
    session_id: str,
    history_item: dict[str, Any],
    now_iso: str,
) -> None:
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)
    user_ref.set({"updatedAt": now_iso, "lastInterviewAt": now_iso}, merge=True)
    user_ref.collection("interviews").document(session_id).set(history_item, merge=True)


def delete_user_interview_history(*, uid: str, session_id: str) -> None:
    db = get_firestore_client()
    user_ref = db.collection("users").document(uid)
    user_ref.collection("interviews").document(session_id).delete()

