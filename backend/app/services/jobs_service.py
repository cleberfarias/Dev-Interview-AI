from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from ..ai.router import AIProviderError, AIRouter
from ..jobs import analyzer
from ..repositories import candidate_profile_repository, job_analysis_repository
from ..resume import matcher
from ..schemas import AnalysisTrace, JobAnalyzeRequest, JobAnalyzeResponse, JobAnalysisResult, ResumeMatchResult
from . import ai_observability_service

logger = logging.getLogger("uvicorn.error")
ai_router = AIRouter()
JOB_PROMPT_VERSION = "job_v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _confidence_from_source(source: str) -> float:
    if source == "ai":
        return 0.9
    if source == "hybrid":
        return 0.82
    return 0.65


def _prepend_recent_ids(current: Any, new_id: str, max_items: int = 10) -> list[str]:
    base = [item for item in (current or []) if isinstance(item, str) and item.strip()]
    out = [new_id]
    for item in base:
        if item == new_id:
            continue
        out.append(item)
        if len(out) >= max_items:
            break
    return out


def _sync_candidate_profile_job(
    *,
    user_id: str,
    job_description: str,
    analysis: JobAnalysisResult,
    trace: AnalysisTrace,
    analysis_id: str | None,
    gap_match_score: int | None,
    weak_skills: list[str],
    now_iso: str,
) -> None:
    current = candidate_profile_repository.get_profile(user_id) or {}
    patch: dict[str, Any] = {
        "userId": user_id,
        "jobDescription": job_description,
        "updatedAt": now_iso,
        "lastJobAnalysisTrace": trace.model_dump(),
    }
    if analysis.roleTitleGuess:
        patch["targetRole"] = analysis.roleTitleGuess
    if analysis.seniorityGuess and analysis.seniorityGuess != "unknown":
        patch["experienceLevel"] = analysis.seniorityGuess
    if weak_skills:
        patch["weakSkills"] = weak_skills
    if gap_match_score is not None:
        patch["lastMatchScore"] = int(gap_match_score)
    if analysis_id:
        patch["lastJobAnalysisId"] = analysis_id
        patch["recentJobAnalysisIds"] = _prepend_recent_ids(current.get("recentJobAnalysisIds"), analysis_id)
    if not current.get("createdAt"):
        patch["createdAt"] = now_iso
    candidate_profile_repository.upsert_profile(user_id, patch, merge=True)


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


def _analyze_job_with_ai(
    text: str,
    metadata: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, str | None]]:
    prompt = _build_job_ai_prompt(text)
    try:
        result = ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=700,
            temperature=0.1,
            response_mime_type="application/json",
            metadata=metadata,
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
    metadata = ai_observability_service.build_metadata(
        user=user if isinstance(user, dict) else None,
        agent="job_analyzer_agent",
        prompt_version=JOB_PROMPT_VERSION,
    )
    ai_analysis, ai_meta = _analyze_job_with_ai(text, metadata=metadata)
    analysis_data = _merge_job_analyses(ai_analysis or {}, heuristic_analysis)
    analysis = JobAnalysisResult(**analysis_data)
    if not ai_analysis:
        trace_source = "heuristic"
    else:
        trace_source = "ai" if _is_same_job_analysis(analysis_data, ai_analysis) else "hybrid"
    confidence = _confidence_from_source(trace_source)
    analysis_trace = AnalysisTrace(
        source=trace_source,
        aiProvider=ai_meta.get("provider"),
        aiModel=ai_meta.get("model"),
        promptVersion=JOB_PROMPT_VERSION,
        confidence=confidence,
    )

    gap = None
    if payload.resumeTechnologies:
        gap_data = matcher.match_resume_to_job(payload.resumeTechnologies, text)
        gap = ResumeMatchResult(**gap_data)

    if user and user.get("uid"):
        now_iso = _now_iso()
        analysis_id: str | None = None
        try:
            saved = job_analysis_repository.create_job_analysis(
                {
                    "userId": user["uid"],
                    "jobDescription": text,
                    "aiProvider": analysis_trace.aiProvider,
                    "aiModel": analysis_trace.aiModel,
                    "source": analysis_trace.source,
                    "promptVersion": analysis_trace.promptVersion,
                    "analysis": analysis.model_dump(),
                    "gap": gap.model_dump() if gap else None,
                    "confidence": analysis_trace.confidence,
                    "createdAt": now_iso,
                }
            )
            analysis_id = saved.get("id")
        except Exception:
            logger.exception("Failed to persist full job analysis for uid=%s", user.get("uid"))

        summary = {
            "experienceLevel": analysis.seniorityGuess,
            "topSkills": analysis.requiredSkills[:5],
            "matchScore": gap.matchScore if gap else None,
        }
        try:
            candidate_profile_repository.record_analysis_trace(
                user_id=user["uid"],
                kind="job",
                trace=analysis_trace.model_dump(),
                summary=summary,
                now_iso=now_iso,
            )
        except Exception:
            logger.exception("Failed to persist job analysis trace for uid=%s", user.get("uid"))

        try:
            _sync_candidate_profile_job(
                user_id=user["uid"],
                job_description=text,
                analysis=analysis,
                trace=analysis_trace,
                analysis_id=analysis_id,
                gap_match_score=gap.matchScore if gap else None,
                weak_skills=(gap.missingSkills if gap else []),
                now_iso=now_iso,
            )
        except Exception:
            logger.exception("Failed to sync candidate profile from job analysis for uid=%s", user.get("uid"))

    return JobAnalyzeResponse(
        analysis=analysis,
        gap=gap,
        analysisTrace=analysis_trace,
    )
