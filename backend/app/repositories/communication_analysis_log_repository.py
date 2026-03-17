from __future__ import annotations

from typing import Any

from ..firebase_admin import get_firestore_client


def create_log(payload: dict[str, Any]) -> None:
    get_firestore_client().collection("communication_analysis_logs").document().set(dict(payload or {}), merge=False)
