from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from ..repositories import (
    ai_execution_log_repository,
    interview_metrics_repository,
    product_metrics_repository,
    session_repository,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persistence_enabled() -> bool:
    flag = str(os.environ.get("INTERVIEW_METRICS_ENABLED", "true")).strip().lower()
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


def _parse_iso(ts: Any) -> datetime | None:
    if not isinstance(ts, str):
        return None
    value = ts.strip()
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _duration_seconds_from_session(session: dict[str, Any] | None) -> int:
    if not isinstance(session, dict):
        return 0
    started_at = _parse_iso(session.get("createdAt"))
    finished_at = _parse_iso(session.get("finishedAt")) or _parse_iso(session.get("updatedAt"))
    if not started_at or not finished_at:
        return 0
    duration = (finished_at - started_at).total_seconds()
    return max(0, int(round(duration)))


def _metrics_from_ai_logs(session_id: str) -> dict[str, Any]:
    logs = ai_execution_log_repository.list_logs_by_session(session_id, limit=3000)
    success_logs = [entry for entry in logs if str(entry.get("status") or "").strip().lower() == "success"]

    latencies_ms = [
        _safe_float(entry.get("latencyMs"), 0.0)
        for entry in success_logs
        if _safe_float(entry.get("latencyMs"), 0.0) > 0
    ]
    average_latency_seconds = round((sum(latencies_ms) / len(latencies_ms)) / 1000.0, 3) if latencies_ms else 0.0

    total_cost = round(
        sum(_safe_float(entry.get("estimatedCost"), 0.0) for entry in success_logs),
        6,
    )

    questions_asked = len(
        [
            entry
            for entry in success_logs
            if str(entry.get("task") or "").strip().lower() == "evaluate"
            and "evaluator" in str(entry.get("agent") or "").strip().lower()
        ]
    )
    if questions_asked <= 0:
        questions_asked = len(
            [entry for entry in success_logs if str(entry.get("task") or "").strip().lower() == "evaluate"]
        )

    return {
        "averageLatency": average_latency_seconds,
        "totalCost": total_cost,
        "questionsAsked": max(0, int(questions_asked)),
    }


def _overall_score_from_report(report: Any) -> float | None:
    score = None
    if isinstance(report, dict):
        score = report.get("overallScore")
    else:
        score = getattr(report, "overallScore", None)
    if score is None:
        return None
    value = max(0.0, min(10.0, _safe_float(score, 0.0)))
    return round(value, 2)


def _compute_skill_improvement_rate(completed: list[dict[str, Any]]) -> float:
    by_user: dict[str, list[tuple[datetime | None, float]]] = {}
    for item in completed:
        user_id = str(item.get("userId") or "").strip()
        if not user_id:
            continue
        score_raw = item.get("overallScore")
        if score_raw is None:
            continue
        score = _safe_float(score_raw, 0.0)
        ts = _parse_iso(item.get("finishedAt")) or _parse_iso(item.get("updatedAt")) or _parse_iso(item.get("startedAt"))
        by_user.setdefault(user_id, []).append((ts, score))

    eligible = 0
    improved = 0
    for user_scores in by_user.values():
        if len(user_scores) < 2:
            continue
        eligible += 1
        sorted_scores = sorted(
            user_scores,
            key=lambda item: item[0] or datetime(1970, 1, 1, tzinfo=timezone.utc),
        )
        first_score = sorted_scores[0][1]
        last_score = sorted_scores[-1][1]
        if (last_score - first_score) >= 0.3:
            improved += 1

    if eligible <= 0:
        return 0.0
    return round(improved / eligible, 4)


def refresh_product_metrics() -> dict[str, Any]:
    if not _persistence_enabled():
        return {}
    started_sessions = session_repository.count_sessions()
    completed_sessions = session_repository.count_sessions(status="finished")

    metrics = interview_metrics_repository.list_metrics(limit=5000)
    completed_metrics = [entry for entry in metrics if str(entry.get("status") or "").strip().lower() == "completed"]

    response_times = [
        _safe_float(entry.get("averageLatency"), 0.0)
        for entry in completed_metrics
        if _safe_float(entry.get("averageLatency"), 0.0) > 0
    ]
    costs = [
        _safe_float(entry.get("totalCost"), 0.0)
        for entry in completed_metrics
        if _safe_float(entry.get("totalCost"), -1.0) >= 0
    ]

    avg_response_time = round(sum(response_times) / len(response_times), 3) if response_times else 0.0
    avg_cost_per_interview = round(sum(costs) / len(costs), 6) if costs else 0.0
    completion_rate = round((completed_sessions / started_sessions), 4) if started_sessions > 0 else 0.0
    skill_improvement_rate = _compute_skill_improvement_rate(completed_metrics)

    payload = {
        "avgResponseTime": avg_response_time,
        "avgCostPerInterview": avg_cost_per_interview,
        "completionRate": completion_rate,
        "skillImprovementRate": skill_improvement_rate,
        "startedSessions": max(0, int(started_sessions)),
        "completedSessions": max(0, int(completed_sessions)),
        "updatedAt": _now_iso(),
    }
    return product_metrics_repository.upsert_metrics(payload, merge=True)


def record_session_started(*, session_id: str, user_id: str | None, config: Any = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sessionId": session_id,
        "userId": user_id,
        "status": "started",
        "startedAt": _now_iso(),
        "averageLatency": 0.0,
        "totalCost": 0.0,
        "questionsAsked": 0,
        "durationSeconds": 0,
        "updatedAt": _now_iso(),
    }
    if hasattr(config, "track"):
        payload["track"] = getattr(config, "track")
    if hasattr(config, "seniority"):
        payload["seniority"] = getattr(config, "seniority")
    if not _persistence_enabled():
        return payload
    return interview_metrics_repository.upsert_metrics(session_id, payload, merge=True)


def record_session_completed(*, session_id: str, user_id: str | None, report: Any = None) -> dict[str, Any]:
    if not _persistence_enabled():
        return {
            "sessionId": session_id,
            "userId": user_id,
            "status": "completed",
            "updatedAt": _now_iso(),
            "overallScore": _overall_score_from_report(report),
        }

    session = session_repository.get_session(session_id) or {}
    from_logs = _metrics_from_ai_logs(session_id)
    duration_seconds = _duration_seconds_from_session(session)
    now_iso = _now_iso()

    payload: dict[str, Any] = {
        "sessionId": session_id,
        "userId": user_id,
        "status": "completed",
        "averageLatency": from_logs["averageLatency"],
        "totalCost": from_logs["totalCost"],
        "questionsAsked": from_logs["questionsAsked"],
        "durationSeconds": max(0, int(duration_seconds)),
        "finishedAt": session.get("finishedAt") or now_iso,
        "updatedAt": now_iso,
    }
    overall_score = _overall_score_from_report(report)
    if overall_score is not None:
        payload["overallScore"] = overall_score

    saved = interview_metrics_repository.upsert_metrics(session_id, payload, merge=True)
    refresh_product_metrics()
    return saved
