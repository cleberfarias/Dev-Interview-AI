from __future__ import annotations

import re


TECH_KEYWORDS = [
    "python",
    "java",
    "javascript",
    "typescript",
    "go",
    "rust",
    "php",
    "ruby",
    "c",
    "c++",
    "c#",
    "kotlin",
    "swift",
    "react",
    "angular",
    "vue",
    "next.js",
    "node.js",
    "fastapi",
    "django",
    "flask",
    "spring",
    "dotnet",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "firebase",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "terraform",
    "git",
    "graphql",
    "rest",
    "microservices",
]

PROJECT_HINTS = [
    "project",
    "projeto",
    "built",
    "desenvolvi",
    "developed",
    "implemented",
    "arquitet",
]

RESPONSIBILITY_HINTS = [
    "responsible",
    "responsavel",
    "lider",
    "coordenei",
    "managed",
    "supported",
    "maintained",
]

COMPANY_HINTS = [
    "inc",
    "ltda",
    "llc",
    "corp",
    "company",
    "tecnologia",
    "solutions",
    "systems",
]


def _candidate_lines(text: str) -> list[str]:
    raw_lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines: list[str] = []
    for line in raw_lines:
        normalized = re.sub(r"^[\-\*\u2022\s]+", "", line).strip()
        if normalized:
            lines.append(normalized)
    return lines


def _unique_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def extract_technologies(text: str) -> list[str]:
    lowered = text.lower()
    found = [skill for skill in TECH_KEYWORDS if skill.lower() in lowered]
    return _unique_preserve_order(found)


def _guess_experience_level(text: str) -> str:
    lowered = text.lower()

    for token in ("senior", "sr", "staff", "principal", "especialista"):
        if token in lowered:
            return "senior"
    for token in ("mid", "pleno", "intermediate"):
        if token in lowered:
            return "mid"
    for token in ("junior", "jr", "trainee", "intern", "estagio"):
        if token in lowered:
            return "junior"

    years = re.findall(r"(\d+)\s*\+?\s*(?:years?|anos?)", lowered)
    if years:
        max_years = max(int(y) for y in years)
        if max_years >= 7:
            return "senior"
        if max_years >= 3:
            return "mid"
        return "junior"

    return "unknown"


def _extract_by_hints(lines: list[str], hints: list[str], max_items: int = 5) -> list[str]:
    out: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(h in lowered for h in hints):
            out.append(line)
        if len(out) >= max_items:
            break
    return _unique_preserve_order(out)


def _build_summary(lines: list[str], max_chars: int = 320) -> str:
    if not lines:
        return ""
    joined = " ".join(lines[:4]).strip()
    if len(joined) <= max_chars:
        return joined
    return joined[: max_chars - 3].rstrip() + "..."


def extract_resume_data(text: str) -> dict:
    lines = _candidate_lines(text)
    technologies = extract_technologies(text)
    experience_level = _guess_experience_level(text)
    projects = _extract_by_hints(lines, PROJECT_HINTS)
    responsibilities = _extract_by_hints(lines, RESPONSIBILITY_HINTS)
    companies = _extract_by_hints(lines, COMPANY_HINTS)
    summary = _build_summary(lines)

    return {
        "technologies": technologies,
        "experienceLevel": experience_level,
        "projects": projects,
        "companies": companies,
        "responsibilities": responsibilities,
        "resumeSummary": summary,
    }

