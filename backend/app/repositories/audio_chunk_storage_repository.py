from __future__ import annotations

from ..firebase_admin import get_storage_bucket


def _extension_from_mime_type(mime_type: str) -> str:
    normalized = (mime_type or "audio/webm").split(";", 1)[0].strip().lower()
    if normalized in {"audio/mp4", "audio/x-m4a", "audio/m4a"}:
        return "m4a"
    if normalized in {"audio/ogg", "audio/opus"}:
        return "ogg"
    if normalized in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return "wav"
    if normalized in {"audio/mpeg", "audio/mp3", "audio/mpga"}:
        return "mp3"
    return "webm"


def upload_audio_chunk_bytes(
    *,
    session_id: str,
    question_id: str | None,
    chunk_id: str,
    audio_bytes: bytes,
    mime_type: str,
    prefix: str = "audio_chunks",
) -> str | None:
    bucket = get_storage_bucket()
    if bucket is None:
        return None

    extension = _extension_from_mime_type(mime_type)
    question_token = (question_id or "question").strip() or "question"
    blob_path = f"{prefix}/{session_id}/{question_token}/{chunk_id}.{extension}"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(audio_bytes, content_type=mime_type or "audio/webm")
    return blob_path
