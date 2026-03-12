from __future__ import annotations

from typing import Any


def run(*, evaluation: dict[str, Any]) -> dict[str, Any]:
    strengths = evaluation.get("strengths") if isinstance(evaluation.get("strengths"), list) else []
    improvements = evaluation.get("improvements") if isinstance(evaluation.get("improvements"), list) else []

    tips = [item for item in improvements if isinstance(item, str) and item.strip()][:3]
    reinforce = [item for item in strengths if isinstance(item, str) and item.strip()][:2]

    return {
        "tips": tips,
        "reinforce": reinforce,
        "idealAnswerOutline": [
            "Start with context and constraints.",
            "Explain your decision and trade-offs.",
            "Close with measurable outcome.",
        ],
    }

