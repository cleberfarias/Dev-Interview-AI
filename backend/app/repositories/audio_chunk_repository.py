from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def _collection():
    return get_firestore_client().collection("audio_chunks")


def _sanitize_token(value: str) -> str:
    clean = str(value or "").strip() or "unknown"
    return clean.replace("/", "_").replace("\\", "_").replace(" ", "_")


def build_chunk_id(
    *,
    session_id: str,
    question_id: str | None,
    chunk_index: int,
    provided_chunk_id: str | None = None,
) -> str:
    if str(provided_chunk_id or "").strip():
        return _sanitize_token(str(provided_chunk_id))
    return "__".join(
        [
            _sanitize_token(session_id),
            _sanitize_token(question_id or "question"),
            str(int(chunk_index)),
        ]
    )


def get_chunk_metadata(chunk_id: str) -> dict[str, Any] | None:
    ref = _collection().document(chunk_id)
    snap = ref.get()
    if not snap.exists:
        return None
    payload = snap.to_dict() or {}
    payload.setdefault("id", snap.id)
    return payload


def create_chunk_metadata(chunk_id: str, data: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    existing = get_chunk_metadata(chunk_id)
    if existing is not None:
        return False, existing

    ref = _collection().document(chunk_id)
    payload = dict(data or {})
    payload["id"] = chunk_id
    ref.set(payload, merge=False)
    return True, payload
