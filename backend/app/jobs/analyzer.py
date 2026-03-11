from __future__ import annotations

import re

from ..resume.extractor import extract_technologies


SENIORITY_HINTS = {
    "senior": {"senior", "sr", "staff", "principal", "lead"},
    "mid": {"mid", "pleno", "intermediate"},
    "junior": {"junior", "jr", "entry", "trainee", "intern"},
}

RESPONSIBILITY_HINTS = [
    "design",
    "build",
    "implement",
    "maintain",
    "monitor",
    "review",
    "deploy",
    "scale",
    "arquitet",
    "desenvolv",
    "manter",
    "implantar",
]

SOFT_SKILL_HINTS = [
    "communication",
    "comunica",
    "ownership",
    "lider",
    "collaboration",
    "colabora",
    "problem solving",
    "resilience",
]


def _lines(text: str) -> list[str]:
    raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    for line in raw:
        cleaned = re.sub(r"^[\-\*\u2022\s]+", "", line).strip()
        if cleaned:
            out.append(cleaned)
    return out


def _guess_role_title(lines: list[str]) -> str:
    if not lines:
        return "Software Engineer"
    first = lines[0]
    if 2 <= len(first) <= 90:
        return first
    return "Software Engineer"


def _guess_seniority(text: str) -> str:
    lowered = text.lower()
    for level in ("senior", "mid", "junior"):
        if any(token in lowered for token in SENIORITY_HINTS[level]):
            return level
    years = re.findall(r"(\d+)\s*\+?\s*(?:years?|anos?)", lowered)
    if years:
        max_years = max(int(y) for y in years)
        if max_years >= 7:
            return "senior"
        if max_years >= 3:
            return "mid"
        return "junior"
    return "unknown"


def _extract_responsibilities(lines: list[str], limit: int = 8) -> list[str]:
    result: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(hint in lowered for hint in RESPONSIBILITY_HINTS):
            result.append(line)
        if len(result) >= limit:
            break
    return result


def _extract_soft_skills(lines: list[str], limit: int = 5) -> list[str]:
    result: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(hint in lowered for hint in SOFT_SKILL_HINTS):
            result.append(line)
        if len(result) >= limit:
            break
    return result


def analyze_job_description(text: str) -> dict:
    lines = _lines(text)
    role_title = _guess_role_title(lines)
    seniority = _guess_seniority(text)
    required_skills = extract_technologies(text)
    responsibilities = _extract_responsibilities(lines)
    soft_skills = _extract_soft_skills(lines)

    interview_focus: list[str] = []
    for skill in required_skills[:6]:
        interview_focus.append(f"Prepare deep-dive examples for {skill}.")
    if soft_skills:
        interview_focus.append("Prepare behavioral examples for communication and collaboration.")
    if not interview_focus:
        interview_focus.append("Clarify architecture trade-offs and delivery ownership.")

    return {
        "roleTitleGuess": role_title,
        "seniorityGuess": seniority,
        "requiredSkills": required_skills,
        "responsibilities": responsibilities,
        "softSkills": soft_skills,
        "interviewFocus": interview_focus,
    }

