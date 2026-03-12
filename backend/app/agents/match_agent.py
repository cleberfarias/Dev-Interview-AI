from __future__ import annotations

from typing import Any

from ..resume import matcher


def run(*, resume_skills: list[str], job_description: str) -> dict[str, Any]:
    return matcher.match_resume_to_job(resume_skills or [], job_description or "")

