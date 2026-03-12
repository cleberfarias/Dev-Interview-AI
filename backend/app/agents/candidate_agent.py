from __future__ import annotations

from typing import Any

from ..resume import extractor


def run(*, resume_text: str, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed = extractor.extract_resume_data(resume_text or "")
    return {
        "skills": parsed.get("technologies") or [],
        "seniority": parsed.get("experienceLevel") or "unknown",
        "summary": parsed.get("resumeSummary") or "",
        "profileContext": profile or {},
    }

