from __future__ import annotations

from typing import Any


def run(*, report: dict[str, Any]) -> dict[str, Any]:
    plan7 = report.get("plan7Days")
    if isinstance(plan7, list) and plan7:
        topics = []
        for item in plan7[:4]:
            if not isinstance(item, dict):
                continue
            task = str(item.get("task") or "").strip()
            if task:
                topics.append(task)
        return {
            "priorityTopics": topics,
            "weeklyPlan": plan7,
        }

    return {
        "priorityTopics": [
            "Communication clarity",
            "Technical depth",
            "Problem solving structure",
        ],
        "weeklyPlan": [],
    }

