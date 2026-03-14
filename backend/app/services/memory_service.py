from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from ..repositories import candidate_memory_repository


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persistence_enabled() -> bool:
    flag = str(os.environ.get("CANDIDATE_MEMORY_ENABLED", "true")).strip().lower()
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


def _normalize_skill(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text[:64]


def _normalize_string_list(value: Any, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        normalized = _normalize_skill(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _trim_score_history(values: list[float], limit: int = 20) -> list[float]:
    return [round(v, 2) for v in values[-limit:]]


def _trend_from_history(score_history: list[float]) -> str:
    if len(score_history) < 3:
        return "stable"
    recent_window = score_history[-3:]
    previous_window = score_history[-6:-3] if len(score_history) >= 6 else score_history[:-3]
    if not previous_window:
        return "stable"

    recent_avg = sum(recent_window) / max(1, len(recent_window))
    previous_avg = sum(previous_window) / max(1, len(previous_window))
    delta = recent_avg - previous_avg
    if delta >= 0.3:
        return "improving"
    if delta <= -0.3:
        return "declining"
    return "stable"


def load_candidate_memory(user_id: str) -> dict[str, Any]:
    if not user_id:
        return {}
    if not _persistence_enabled():
        return {}
    return candidate_memory_repository.get_memory(user_id) or {}


def _report_skill_scores(report: Any, config: Any) -> tuple[dict[str, float], list[str]]:
    skills_scores: dict[str, float] = {}
    gaps: list[str] = []

    overall = max(0.0, min(10.0, _safe_float(getattr(report, "overallScore", 0.0), 0.0)))
    criteria_summary = getattr(report, "criteriaSummary", None)
    scores_summary = getattr(report, "scoresSummary", None)

    technical_score = overall
    if criteria_summary and hasattr(criteria_summary, "technicalPrecision"):
        technical_score = _safe_float(getattr(criteria_summary, "technicalPrecision"), overall)
    elif scores_summary and hasattr(scores_summary, "technical"):
        technical_score = _safe_float(getattr(scores_summary, "technical"), overall)
    technical_score = max(0.0, min(10.0, technical_score))

    job_match = getattr(report, "jobMatch", None)
    covered: list[str] = []
    if isinstance(job_match, dict):
        covered = _normalize_string_list(job_match.get("covered"), limit=20)
        gaps = _normalize_string_list(job_match.get("gaps"), limit=20)

    stack_skills: list[str] = []
    if hasattr(config, "stacks"):
        stack_skills = _normalize_string_list(getattr(config, "stacks", []), limit=20)

    for skill in covered + stack_skills:
        if skill not in skills_scores:
            skills_scores[skill] = technical_score
        else:
            skills_scores[skill] = max(skills_scores[skill], technical_score)

    gap_score = max(0.0, technical_score - 2.0)
    for gap in gaps:
        current = skills_scores.get(gap)
        if current is None:
            skills_scores[gap] = gap_score
        else:
            skills_scores[gap] = min(current, gap_score)

    return skills_scores, gaps


def _communication_score(report: Any) -> float:
    criteria_summary = getattr(report, "criteriaSummary", None)
    if criteria_summary and hasattr(criteria_summary, "communication"):
        return round(max(0.0, min(10.0, _safe_float(getattr(criteria_summary, "communication"), 0.0))), 2)

    scores_summary = getattr(report, "scoresSummary", None)
    if scores_summary and hasattr(scores_summary, "communication"):
        return round(max(0.0, min(10.0, _safe_float(getattr(scores_summary, "communication"), 0.0))), 2)

    return round(max(0.0, min(10.0, _safe_float(getattr(report, "overallScore", 0.0), 0.0))), 2)


def update_candidate_memory_after_report(
    *,
    user_id: str,
    report: Any,
    config: Any,
) -> dict[str, Any]:
    if not user_id:
        return {}

    current = load_candidate_memory(user_id)
    current_skill_progress = current.get("skillProgress")
    skill_progress: dict[str, dict[str, Any]] = {}
    if isinstance(current_skill_progress, dict):
        for raw_skill, raw_entry in current_skill_progress.items():
            skill_name = _normalize_skill(raw_skill)
            if not skill_name or not isinstance(raw_entry, dict):
                continue
            history = raw_entry.get("scoreHistory")
            score_history = [
                max(0.0, min(10.0, _safe_float(item, 0.0)))
                for item in (history if isinstance(history, list) else [])
                if isinstance(item, (int, float))
            ]
            score_history = _trim_score_history(score_history)
            if not score_history:
                continue
            average = round(sum(score_history) / len(score_history), 2)
            skill_progress[skill_name] = {
                "scoreHistory": score_history,
                "average": average,
                "trend": _trend_from_history(score_history),
            }

    extracted_scores, report_gaps = _report_skill_scores(report, config)
    for skill_name, score in extracted_scores.items():
        entry = skill_progress.get(skill_name) or {"scoreHistory": []}
        history = entry.get("scoreHistory")
        if not isinstance(history, list):
            history = []
        history = [
            max(0.0, min(10.0, _safe_float(item, 0.0)))
            for item in history
            if isinstance(item, (int, float))
        ]
        history.append(max(0.0, min(10.0, _safe_float(score, 0.0))))
        history = _trim_score_history(history)
        average = round(sum(history) / len(history), 2)
        skill_progress[skill_name] = {
            "scoreHistory": history,
            "average": average,
            "trend": _trend_from_history(history),
        }

    raw_gap_counts = current.get("gapCounts")
    gap_counts: dict[str, int] = {}
    if isinstance(raw_gap_counts, dict):
        for key, value in raw_gap_counts.items():
            normalized = _normalize_skill(key)
            if not normalized:
                continue
            try:
                gap_counts[normalized] = max(0, int(value))
            except Exception:
                continue

    for gap in report_gaps:
        gap_counts[gap] = gap_counts.get(gap, 0) + 1

    recurring_gaps = [
        gap
        for gap, count in sorted(gap_counts.items(), key=lambda item: item[1], reverse=True)
        if count >= 2
    ][:12]

    strong_skills = [
        skill
        for skill, entry in sorted(
            skill_progress.items(),
            key=lambda item: _safe_float((item[1] or {}).get("average"), 0.0),
            reverse=True,
        )
        if _safe_float((entry or {}).get("average"), 0.0) >= 7.0
    ][:12]

    payload = {
        "userId": user_id,
        "skillProgress": skill_progress,
        "recurringGaps": recurring_gaps,
        "strongSkills": strong_skills,
        "communicationScore": _communication_score(report),
        "gapCounts": gap_counts,
        "lastUpdated": _now_iso(),
    }
    if not _persistence_enabled():
        return payload
    return candidate_memory_repository.upsert_memory(user_id, payload, merge=True)
