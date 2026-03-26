from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from ..repositories import ai_execution_log_repository
from ..request_context import get_request_id, get_session_id, get_user_id

logger = logging.getLogger("uvicorn.error")


_MODEL_COST_PER_1K_TOKENS_USD: dict[str, float] = {
    "gpt-4.1-nano": 0.0004,
    "gpt-4o-mini": 0.0015,
    "gpt-4o": 0.0100,
    "gemini-1.5-mini": 0.0010,
    "llama-3.1-8b-instant": 0.0003,
}

_TASK_PROMPT_VERSION: dict[str, str] = {
    "plan": "interview_plan_v3",
    "evaluate": "evaluation_v3",
    "report": "report_v3",
    "next_question": "next_question_v4",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persistence_enabled() -> bool:
    flag = str(os.environ.get("AI_OBSERVABILITY_ENABLED", "true")).strip().lower()
    if flag in {"0", "false", "no", "off"}:
        return False
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return True


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _model_rate(model: str | None) -> float:
    raw_model = str(model or "").strip().lower()
    if not raw_model:
        return 0.0
    for key, rate in _MODEL_COST_PER_1K_TOKENS_USD.items():
        if key in raw_model:
            return float(rate)
    return 0.0


def estimate_cost(
    *,
    model: str | None,
    tokens_used: int | None = None,
    prompt_text: str | None = None,
    output_text: str | None = None,
) -> float:
    rate = _model_rate(model)
    if rate <= 0:
        return 0.0
    token_count = _safe_int(tokens_used, default=0)
    if token_count <= 0:
        prompt_chars = len(prompt_text or "")
        output_chars = len(output_text or "")
        token_count = max(1, (prompt_chars + output_chars) // 4)
    return round((float(token_count) / 1000.0) * rate, 6)


def default_prompt_version(task_name: str | None) -> str:
    key = str(task_name or "").strip().lower()
    return _TASK_PROMPT_VERSION.get(key, "unknown")


def _resolve_request_id(metadata: dict[str, Any]) -> str:
    request_id = str(metadata.get("requestId") or "").strip()
    if request_id:
        return request_id
    request_id_ctx = str(get_request_id() or "").strip()
    if request_id_ctx:
        return request_id_ctx
    return "unknown"


def build_metadata(
    *,
    user: dict[str, Any] | None = None,
    session_id: str | None = None,
    agent: str | None = None,
    prompt_version: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = dict(extra or {})
    if user and isinstance(user, dict):
        uid = str(user.get("uid") or "").strip()
        if uid and not meta.get("userId"):
            meta["userId"] = uid
    sid = str(session_id or "").strip()
    if sid and not meta.get("sessionId"):
        meta["sessionId"] = sid
    agent_name = str(agent or "").strip()
    if agent_name and not meta.get("agent"):
        meta["agent"] = agent_name
    prompt_v = str(prompt_version or "").strip()
    if prompt_v and not meta.get("promptVersion"):
        meta["promptVersion"] = prompt_v
    request_id = str(get_request_id() or "").strip()
    if request_id and not meta.get("requestId"):
        meta["requestId"] = request_id
    return meta


def log_execution(
    *,
    task_name: str,
    provider: str | None,
    model: str | None,
    latency_ms: int | None,
    tokens_used: int | None,
    status: str,
    prompt_text: str | None = None,
    output_text: str | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    if not _persistence_enabled():
        return

    info = metadata or {}
    request_id = _resolve_request_id(info)
    user_id = str(info.get("userId") or get_user_id() or "").strip() or None
    session_id = str(info.get("sessionId") or get_session_id() or "").strip() or None
    agent = str(info.get("agent") or f"{task_name}_agent").strip()
    prompt_version = str(info.get("promptVersion") or default_prompt_version(task_name)).strip()

    estimated_cost = estimate_cost(
        model=model,
        tokens_used=tokens_used,
        prompt_text=prompt_text,
        output_text=output_text,
    )

    payload: dict[str, Any] = {
        "requestId": request_id,
        "userId": user_id,
        "sessionId": session_id,
        "agent": agent,
        "task": task_name,
        "provider": provider,
        "model": model,
        "promptVersion": prompt_version,
        "latencyMs": _safe_int(latency_ms, default=0),
        "tokensUsed": _safe_int(tokens_used, default=0) or None,
        "estimatedCost": _safe_float(estimated_cost, default=0.0),
        "status": status,
        "error": str(error_message or "").strip() or None,
        "createdAt": _now_iso(),
    }

    try:
        ai_execution_log_repository.create_log(payload)
    except Exception:
        logger.exception(
            "Failed to persist ai_execution_logs requestId=%s agent=%s task=%s",
            request_id,
            agent,
            task_name,
        )
