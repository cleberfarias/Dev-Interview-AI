from __future__ import annotations

from typing import Any

from ..jobs import analyzer


def run(*, job_description: str) -> dict[str, Any]:
    data = analyzer.analyze_job_description(job_description or "")
    return {
        "roleTitleGuess": data.get("roleTitleGuess") or "Software Engineer",
        "seniorityGuess": data.get("seniorityGuess") or "unknown",
        "requiredSkills": data.get("requiredSkills") or [],
        "responsibilities": data.get("responsibilities") or [],
        "softSkills": data.get("softSkills") or [],
        "interviewFocus": data.get("interviewFocus") or [],
    }

