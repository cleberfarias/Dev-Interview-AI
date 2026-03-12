from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from ..ai.router import AIProviderError, AIRouter
from ..repositories import candidate_profile_repository, resume_analysis_repository
from ..resume import extractor, matcher, parser
from ..schemas import AnalysisTrace, ResumeAnalyzeRequest, ResumeAnalyzeResponse, ResumeExtraction, ResumeMatchResult

logger = logging.getLogger("uvicorn.error")
ai_router = AIRouter()
RESUME_PROMPT_VERSION = "resume_v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _confidence_from_source(source: str) -> float:
    if source == "ai":
        return 0.9
    if source == "hybrid":
        return 0.82
    return 0.65


def _parsing_mode_from_source(source: str) -> str:
    if source == "ai":
        return "ai"
    if source == "hybrid":
        return "hybrid"
    return "deterministic"


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


def _sync_candidate_profile_resume(
    *,
    user_id: str,
    extraction: ResumeExtraction,
    trace: AnalysisTrace,
    analysis_id: str | None,
    match_score: int | None,
    now_iso: str,
) -> None:
    current = candidate_profile_repository.get_profile(user_id) or {}
    patch: dict[str, Any] = {
        "userId": user_id,
        "updatedAt": now_iso,
        "lastResumeAnalysisTrace": trace.model_dump(),
    }
    if extraction.experienceLevel and extraction.experienceLevel != "unknown":
        patch["experienceLevel"] = extraction.experienceLevel
    if extraction.technologies:
        patch["primarySkills"] = extraction.technologies
    if extraction.resumeSummary:
        patch["resumeSummary"] = extraction.resumeSummary
    if match_score is not None:
        patch["lastMatchScore"] = int(match_score)
    if analysis_id:
        patch["lastResumeAnalysisId"] = analysis_id
        patch["recentResumeAnalysisIds"] = _prepend_recent_ids(current.get("recentResumeAnalysisIds"), analysis_id)
    if not current.get("createdAt"):
        patch["createdAt"] = now_iso
    candidate_profile_repository.upsert_profile(user_id, patch, merge=True)


def _b64_to_bytes(value: str) -> bytes:
    if "," in value:
        value = value.split(",", 1)[1]
    pad = "=" * (-len(value) % 4)
    return base64.b64decode(value + pad)


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


def _normalize_experience_level(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"junior", "jr"}:
        return "junior"
    if text in {"mid", "pleno", "intermediate"}:
        return "mid"
    if text in {"senior", "sr", "staff", "principal"}:
        return "senior"
    return "unknown"


def _normalize_resume_extraction(data: dict[str, Any]) -> dict[str, Any]:
    technologies = _dedupe_preserve(_string_list(data.get("technologies"), limit=20), lower=True)
    projects = _dedupe_preserve(_string_list(data.get("projects"), limit=8))
    companies = _dedupe_preserve(_string_list(data.get("companies"), limit=8))
    responsibilities = _dedupe_preserve(_string_list(data.get("responsibilities"), limit=10))
    resume_summary = str(data.get("resumeSummary") or "").strip()
    if len(resume_summary) > 500:
        resume_summary = resume_summary[:497].rstrip() + "..."

    return {
        "technologies": technologies,
        "experienceLevel": _normalize_experience_level(data.get("experienceLevel")),
        "projects": projects,
        "companies": companies,
        "responsibilities": responsibilities,
        "resumeSummary": resume_summary,
    }


def _merge_extractions(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "technologies": _dedupe_preserve(
            list(primary.get("technologies") or []) + list(fallback.get("technologies") or []),
            lower=True,
        ),
        "experienceLevel": primary.get("experienceLevel")
        if primary.get("experienceLevel") and primary.get("experienceLevel") != "unknown"
        else fallback.get("experienceLevel", "unknown"),
        "projects": _dedupe_preserve(list(primary.get("projects") or []) + list(fallback.get("projects") or [])),
        "companies": _dedupe_preserve(list(primary.get("companies") or []) + list(fallback.get("companies") or [])),
        "responsibilities": _dedupe_preserve(
            list(primary.get("responsibilities") or []) + list(fallback.get("responsibilities") or [])
        ),
        "resumeSummary": str(primary.get("resumeSummary") or fallback.get("resumeSummary") or ""),
    }
    return _normalize_resume_extraction(merged)


def _is_same_extraction(a: dict[str, Any], b: dict[str, Any]) -> bool:
    na = _normalize_resume_extraction(a)
    nb = _normalize_resume_extraction(b)
    return (
        na.get("technologies") == nb.get("technologies")
        and na.get("experienceLevel") == nb.get("experienceLevel")
        and na.get("projects") == nb.get("projects")
        and na.get("companies") == nb.get("companies")
        and na.get("responsibilities") == nb.get("responsibilities")
        and str(na.get("resumeSummary") or "") == str(nb.get("resumeSummary") or "")
    )


def _build_resume_ai_prompt(text: str) -> str:
    content = text.strip()
    if len(content) > 12000:
        content = content[:12000]
    return (
        "Analise o curriculo abaixo e retorne APENAS JSON valido com esta estrutura:\n"
        "{\n"
        '  "technologies": ["python", "fastapi"],\n'
        '  "experienceLevel": "junior|mid|senior|unknown",\n'
        '  "projects": ["..."],\n'
        '  "companies": ["..."],\n'
        '  "responsibilities": ["..."],\n'
        '  "resumeSummary": "..."\n'
        "}\n\n"
        "Regras:\n"
        "- Seja conservador, nao invente dados.\n"
        "- technologies deve conter nomes curtos e em minusculo.\n"
        "- Se faltar dado, retorne lista vazia ou unknown.\n\n"
        f"Curriculo:\n{content}"
    )


def _extract_resume_with_ai(text: str) -> tuple[dict[str, Any] | None, dict[str, str | None]]:
    prompt = _build_resume_ai_prompt(text)
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
        logger.exception("Resume AI extraction failed")
        return None, {"provider": None, "model": None}

    try:
        payload = _safe_json_loads(result.output_text or "{}")
        return _normalize_resume_extraction(payload), {
            "provider": getattr(result, "provider_used", None),
            "model": getattr(result, "model_used", None),
        }
    except Exception:
        logger.warning("Resume AI returned invalid payload (provider=%s)", getattr(result, "provider_used", "unknown"))
        return None, {
            "provider": getattr(result, "provider_used", None),
            "model": getattr(result, "model_used", None),
        }


def analyze_resume(payload: ResumeAnalyzeRequest, user: dict | None = None) -> ResumeAnalyzeResponse:
    try:
        raw = _b64_to_bytes(payload.fileBase64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    try:
        text = parser.extract_text(payload.fileName, raw, payload.mimeType)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not text:
        raise HTTPException(status_code=400, detail="Empty resume text after parsing")

    heuristic_extraction = _normalize_resume_extraction(extractor.extract_resume_data(text))
    ai_extraction, ai_meta = _extract_resume_with_ai(text)
    extraction_data = _merge_extractions(ai_extraction or {}, heuristic_extraction)
    extraction = ResumeExtraction(**extraction_data)
    if not ai_extraction:
        trace_source = "heuristic"
    else:
        trace_source = "ai" if _is_same_extraction(extraction_data, ai_extraction) else "hybrid"
    confidence = _confidence_from_source(trace_source)
    extraction_trace = AnalysisTrace(
        source=trace_source,
        aiProvider=ai_meta.get("provider"),
        aiModel=ai_meta.get("model"),
        promptVersion=RESUME_PROMPT_VERSION,
        confidence=confidence,
    )

    match = None
    if payload.jobDescription and payload.jobDescription.strip():
        match_data = matcher.match_resume_to_job(extraction.technologies, payload.jobDescription)
        match = ResumeMatchResult(**match_data)

    if user and user.get("uid"):
        now_iso = _now_iso()
        analysis_id: str | None = None
        try:
            saved = resume_analysis_repository.create_resume_analysis(
                {
                    "userId": user["uid"],
                    "fileName": payload.fileName,
                    "aiProvider": extraction_trace.aiProvider,
                    "aiModel": extraction_trace.aiModel,
                    "source": extraction_trace.source,
                    "promptVersion": extraction_trace.promptVersion,
                    "parsingMode": _parsing_mode_from_source(extraction_trace.source),
                    "extraction": extraction.model_dump(),
                    "match": match.model_dump() if match else None,
                    "confidence": extraction_trace.confidence,
                    "createdAt": now_iso,
                }
            )
            analysis_id = saved.get("id")
        except Exception:
            logger.exception("Failed to persist full resume analysis for uid=%s", user.get("uid"))

        summary = {
            "experienceLevel": extraction.experienceLevel,
            "topSkills": extraction.technologies[:5],
            "matchScore": match.matchScore if match else None,
        }
        try:
            candidate_profile_repository.record_analysis_trace(
                user_id=user["uid"],
                kind="resume",
                trace=extraction_trace.model_dump(),
                summary=summary,
                now_iso=now_iso,
            )
        except Exception:
            logger.exception("Failed to persist resume analysis trace for uid=%s", user.get("uid"))

        try:
            _sync_candidate_profile_resume(
                user_id=user["uid"],
                extraction=extraction,
                trace=extraction_trace,
                analysis_id=analysis_id,
                match_score=match.matchScore if match else None,
                now_iso=now_iso,
            )
        except Exception:
            logger.exception("Failed to sync candidate profile from resume analysis for uid=%s", user.get("uid"))

    return ResumeAnalyzeResponse(
        text=text,
        extraction=extraction,
        match=match,
        extractionTrace=extraction_trace,
    )
