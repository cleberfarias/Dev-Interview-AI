from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from ..ai.router import AIProviderError, AIRouter
from ..jobs import analyzer
from ..repositories import candidate_profile_repository
from ..resume import matcher
from ..schemas import AnalysisTrace, JobAnalyzeRequest, JobAnalyzeResponse, JobAnalysisResult, ResumeMatchResult

logger = logging.getLogger("uvicorn.error")
ai_router = AIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json_loads(text: str) -> dict[str, Any]:
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
        return data if isinstance(data, dict) else {}
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            snippet = cleaned[start : end + 1]
            data = json.loads(snippet)
            return data if isinstance(data, dict) else {}
        raise


def _string_list(value: Any, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        out.append(cleaned)
        if len(out) >= limit:
            break
    return out


def _dedupe_preserve(items: list[str], lower: bool = False) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in items:
        item = raw.lower() if lower else raw
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def _normalize_seniority(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"junior", "jr"}:
        return "junior"
    if raw in {"mid", "pleno", "intermediate"}:
        return "mid"
    if raw in {"senior", "sr", "staff", "principal", "lead"}:
        return "senior"
    return "unknown"


def _normalize_job_analysis(data: dict[str, Any]) -> dict[str, Any]:
    role = str(data.get("roleTitleGuess") or "").strip() or "Software Engineer"
    required = _dedupe_preserve(_string_list(data.get("requiredSkills"), limit=20), lower=True)
    responsibilities = _dedupe_preserve(_string_list(data.get("responsibilities"), limit=10))
    soft_skills = _dedupe_preserve(_string_list(data.get("softSkills"), limit=8))
    interview_focus = _dedupe_preserve(_string_list(data.get("interviewFocus"), limit=8))
    if not interview_focus and required:
        interview_focus = [f"Prepare deep-dive examples for {skill}." for skill in required[:4]]
    if not interview_focus:
        interview_focus = ["Clarify architecture trade-offs and delivery ownership."]

    return {
        "roleTitleGuess": role,
        "seniorityGuess": _normalize_seniority(data.get("seniorityGuess")),
        "requiredSkills": required,
        "responsibilities": responsibilities,
        "softSkills": soft_skills,
        "interviewFocus": interview_focus,
    }


def _merge_job_analyses(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    role = str(primary.get("roleTitleGuess") or fallback.get("roleTitleGuess") or "Software Engineer")
    seniority = primary.get("seniorityGuess") if primary.get("seniorityGuess") != "unknown" else None
    if not seniority:
        seniority = fallback.get("seniorityGuess") or "unknown"

    merged = {
        "roleTitleGuess": role,
        "seniorityGuess": seniority,
        "requiredSkills": _dedupe_preserve(
            list(primary.get("requiredSkills") or []) + list(fallback.get("requiredSkills") or []),
            lower=True,
        ),
        "responsibilities": _dedupe_preserve(
            list(primary.get("responsibilities") or []) + list(fallback.get("responsibilities") or [])
        ),
        "softSkills": _dedupe_preserve(list(primary.get("softSkills") or []) + list(fallback.get("softSkills") or [])),
        "interviewFocus": _dedupe_preserve(
            list(primary.get("interviewFocus") or []) + list(fallback.get("interviewFocus") or [])
        ),
    }
    return _normalize_job_analysis(merged)


def _is_same_job_analysis(a: dict[str, Any], b: dict[str, Any]) -> bool:
    na = _normalize_job_analysis(a)
    nb = _normalize_job_analysis(b)
    return (
        na.get("roleTitleGuess") == nb.get("roleTitleGuess")
        and na.get("seniorityGuess") == nb.get("seniorityGuess")
        and na.get("requiredSkills") == nb.get("requiredSkills")
        and na.get("responsibilities") == nb.get("responsibilities")
        and na.get("softSkills") == nb.get("softSkills")
        and na.get("interviewFocus") == nb.get("interviewFocus")
    )


def _build_job_ai_prompt(text: str) -> str:
    content = text.strip()
    if len(content) > 12000:
        content = content[:12000]
    return (
        "Analise a descricao de vaga e retorne APENAS JSON valido com esta estrutura:\n"
        "{\n"
        '  "roleTitleGuess": "...",\n'
        '  "seniorityGuess": "junior|mid|senior|unknown",\n'
        '  "requiredSkills": ["python", "fastapi"],\n'
        '  "responsibilities": ["..."],\n'
        '  "softSkills": ["..."],\n'
        '  "interviewFocus": ["..."]\n'
        "}\n\n"
        "Regras:\n"
        "- requiredSkills deve conter termos tecnicos em minusculo.\n"
        "- Nao inventar requisitos.\n"
        "- Se nao houver sinal claro, use unknown e listas vazias.\n\n"
        f"Descricao da vaga:\n{content}"
    )


def _analyze_job_with_ai(text: str) -> tuple[dict[str, Any] | None, dict[str, str | None]]:
    prompt = _build_job_ai_prompt(text)
    try:
        result = ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=700,
            temperature=0.1,
            response_mime_type="application/json",
        )
    except AIProviderError:
        return None, {"provider": None, "model": None}
    except Exception:
        logger.exception("Job AI analysis failed")
        return None, {"provider": None, "model": None}

    try:
        payload = _safe_json_loads(result.output_text or "{}")
        return _normalize_job_analysis(payload), {
            "provider": getattr(result, "provider_used", None),
            "model": getattr(result, "model_used", None),
        }
    except Exception:
        logger.warning("Job AI returned invalid payload (provider=%s)", getattr(result, "provider_used", "unknown"))
        return None, {
            "provider": getattr(result, "provider_used", None),
            "model": getattr(result, "model_used", None),
        }


def analyze_job(payload: JobAnalyzeRequest, user: dict | None = None) -> JobAnalyzeResponse:
    text = (payload.jobDescription or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="jobDescription is required")

    heuristic_analysis = _normalize_job_analysis(analyzer.analyze_job_description(text))
    ai_analysis, ai_meta = _analyze_job_with_ai(text)
    analysis_data = _merge_job_analyses(ai_analysis or {}, heuristic_analysis)
    analysis = JobAnalysisResult(**analysis_data)
    if not ai_analysis:
        trace_source = "heuristic"
    else:
        trace_source = "ai" if _is_same_job_analysis(analysis_data, ai_analysis) else "hybrid"
    analysis_trace = AnalysisTrace(
        source=trace_source,
        aiProvider=ai_meta.get("provider"),
        aiModel=ai_meta.get("model"),
    )

    if user and user.get("uid"):
        try:
            candidate_profile_repository.record_analysis_trace(
                user_id=user["uid"],
                kind="job",
                trace=analysis_trace.model_dump(),
                now_iso=_now_iso(),
            )
        except Exception:
            logger.exception("Failed to persist job analysis trace for uid=%s", user.get("uid"))

    gap = None
    if payload.resumeTechnologies:
        gap_data = matcher.match_resume_to_job(payload.resumeTechnologies, text)
        gap = ResumeMatchResult(**gap_data)

    return JobAnalyzeResponse(
        analysis=analysis,
        gap=gap,
        analysisTrace=analysis_trace,
    )
