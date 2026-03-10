from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from google.cloud import firestore

from .firebase_admin import get_firestore_client

logger = logging.getLogger("uvicorn.error")


def _safe_str(val: Any) -> Optional[str]:
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def get_user_profile(uid: str) -> Dict[str, Any]:
    """Return a sanitized user profile from Firestore (safe fields only)."""
    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("MCP get_user_profile: Firestore init failed")
        return {}

    try:
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            return {}
        data = doc.to_dict() or {}
        allowed = {
            "uid": data.get("uid") or uid,
            "name": data.get("name") or data.get("displayName"),
            "email": data.get("email"),
            "plan": data.get("plan"),
            "credits": data.get("credits"),
            "lastInterviewAt": data.get("lastInterviewAt"),
        }
        # Remove null-ish values
        return {k: v for k, v in allowed.items() if v is not None}
    except Exception:
        logger.exception("MCP get_user_profile failed")
        return {}


def get_recent_interviews(uid: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Return recent interview summaries (safe fields only)."""
    try:
        limit_val = int(limit or 5)
    except Exception:
        limit_val = 5
    limit_val = max(1, min(limit_val, 20))
    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("MCP get_recent_interviews: Firestore init failed")
        return []

    try:
        items: List[Dict[str, Any]] = []
        q = (
            db.collection("users")
            .document(uid)
            .collection("interviews")
            .order_by("date", direction=firestore.Query.DESCENDING)
            .limit(limit_val)
        )
        for d in q.stream():
            data = d.to_dict() or {}
            items.append(
                {
                    "id": data.get("id"),
                    "date": data.get("date"),
                    "role": data.get("role"),
                    "score": data.get("score"),
                    "style": data.get("style"),
                    "track": data.get("track"),
                }
            )
        return items
    except Exception:
        logger.exception("MCP get_recent_interviews failed")
        return []


def get_rubric(track: str, seniority: str, stacks: List[str], question: Optional[str] = None) -> Dict[str, Any]:
    """Return a lightweight rubric for evaluation prompts."""
    track_key = (track or "").lower()
    senior_key = (seniority or "").lower()
    stack_list = [s.strip() for s in (stacks or []) if _safe_str(s)]

    focus = ["clarity", "structure", "tradeoffs", "correctness"]
    good_signals = ["explains assumptions", "covers edge cases", "communicates clearly"]
    red_flags = ["vague answer", "no structure", "ignores constraints"]

    if "front" in track_key:
        focus += ["state management", "performance", "accessibility", "ui behavior"]
        good_signals += ["mentions rendering cost", "handles async state"]
        red_flags += ["ignores a11y", "over-renders"]
    elif "back" in track_key:
        focus += ["data modeling", "api design", "reliability", "scaling"]
        good_signals += ["mentions latency", "handles failures"]
        red_flags += ["no error handling", "no data model"]
    elif "data" in track_key or "ml" in track_key:
        focus += ["data quality", "pipelines", "metrics", "validation"]
        good_signals += ["talks about evaluation", "guards against leakage"]
        red_flags += ["no metrics", "no validation"]

    if "senior" in senior_key or "lead" in senior_key or "staff" in senior_key:
        focus += ["architecture", "risk", "alignment"]
        good_signals += ["discusses tradeoffs", "prioritizes risks"]
        red_flags += ["over-engineering", "no tradeoffs"]
    elif "junior" in senior_key or "estagio" in senior_key:
        focus += ["fundamentals", "debugging"]
        good_signals += ["asks clarifying questions", "thinks step by step"]
        red_flags += ["confused basics", "no plan"]

    # De-dup and keep it compact
    def _uniq(items: List[str]) -> List[str]:
        seen = set()
        out = []
        for item in items:
            key = item.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out

    return {
        "track": track,
        "seniority": seniority,
        "stacks": stack_list,
        "question": question,
        "focus": _uniq(focus)[:8],
        "good_signals": _uniq(good_signals)[:8],
        "red_flags": _uniq(red_flags)[:8],
    }
