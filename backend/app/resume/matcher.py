from __future__ import annotations

from .extractor import extract_technologies


def _lower_set(values: list[str]) -> set[str]:
    return {v.lower().strip() for v in values if isinstance(v, str) and v.strip()}


def match_resume_to_job(resume_technologies: list[str], job_description: str) -> dict:
    required_skills = extract_technologies(job_description or "")
    resume_set = _lower_set(resume_technologies)
    required_set = _lower_set(required_skills)

    strong_skills = [skill for skill in required_skills if skill.lower() in resume_set]
    missing_skills = [skill for skill in required_skills if skill.lower() not in resume_set]
    weak_skills = [skill for skill in resume_technologies if skill.lower() not in required_set][:5]

    if not required_skills:
        match_score = 0
    else:
        match_score = round((len(strong_skills) / len(required_skills)) * 100)

    interview_suggestions: list[str] = []
    for skill in missing_skills[:5]:
        interview_suggestions.append(f"Prepare practical examples for {skill}.")
    if not interview_suggestions:
        interview_suggestions.append("Focus on depth and trade-offs for your core stack.")

    return {
        "matchScore": int(match_score),
        "strongSkills": strong_skills,
        "weakSkills": weak_skills,
        "missingSkills": missing_skills,
        "interviewSuggestions": interview_suggestions,
    }

