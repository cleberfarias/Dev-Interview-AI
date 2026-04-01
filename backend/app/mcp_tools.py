from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from google.cloud import firestore

from .firebase_admin import get_firestore_client
from .repositories import candidate_memory_repository, job_analysis_repository, resume_analysis_repository

logger = logging.getLogger("uvicorn.error")
TOOL_CONTRACT_VERSION = "mcp.devinterview.v1"


def _safe_str(val: Any) -> Optional[str]:
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def _safe_list(value: Any, limit: int = 12) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    seen: set[str] = set()
    for item in value:
        normalized = _safe_str(item)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _tool_payload(tool_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "toolName": tool_name,
        "contractVersion": TOOL_CONTRACT_VERSION,
        **payload,
    }


def _safe_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _safe_count(value: Any) -> int:
    if isinstance(value, dict):
        return len(value)
    if isinstance(value, list):
        return len(value)
    return 0


def _format_trace_label(value: Any, fallback: str) -> str:
    cleaned = _safe_str(value)
    if not cleaned:
        return fallback
    return cleaned


def _extract_workflow_summary(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    snapshot = _safe_dict(snapshot)
    knowledge_retrieval = _safe_dict(snapshot.get("knowledgeRetrieval"))
    turn_timeline = _safe_dict(snapshot.get("turnEvidenceTimeline"))
    answers = _safe_dict(turn_timeline.get("answers"))
    report_evidence = _safe_dict(snapshot.get("reportEvidence"))
    context_tool_calls = snapshot.get("contextToolCalls") if isinstance(snapshot.get("contextToolCalls"), list) else []
    report_tool_calls = report_evidence.get("toolCalls") if isinstance(report_evidence.get("toolCalls"), list) else []

    context_ready = bool(_safe_dict(snapshot.get("agentRuntime")) or context_tool_calls)
    retrieval_ready = bool(knowledge_retrieval)
    turns_ready = bool(answers)
    report_ready = bool(report_evidence)

    retrieval_mode = _format_trace_label(knowledge_retrieval.get("retrievalMode"), "modo indefinido")
    retrieval_quality = _format_trace_label(knowledge_retrieval.get("quality"), "sem score")
    answer_count = _safe_count(answers)

    last_turn = {}
    for item in answers.values():
        if not isinstance(item, dict):
            continue
        captured_at = _safe_str(item.get("capturedAt")) or ""
        current_last = _safe_str(last_turn.get("capturedAt")) or ""
        if not last_turn or captured_at >= current_last:
            last_turn = item
    last_runtime = _safe_dict(last_turn.get("clientRuntime"))

    stages = [
        {
            "key": "context",
            "label": "Contexto inicial",
            "status": "ready" if context_ready else "pending",
            "summary": (
                f"{_safe_count(_safe_dict(snapshot.get('agentRuntime')))} agente(s) e {len(context_tool_calls)} tool(s) no bootstrap."
                if context_ready
                else "Contexto inicial ainda nao auditado."
            ),
        },
        {
            "key": "retrieval",
            "label": "Knowledge retrieval",
            "status": "ready" if retrieval_ready else "pending",
            "summary": (
                f"Modo {retrieval_mode} com qualidade {retrieval_quality}."
                if retrieval_ready
                else "Retrieval ainda nao consolidado."
            ),
        },
        {
            "key": "turns",
            "label": "Turnos auditados",
            "status": "ready" if turns_ready else "pending",
            "summary": (
                f"{answer_count} resposta(s) com evidencia persistida."
                if turns_ready
                else "Nenhum turno auditado ainda."
            ),
        },
        {
            "key": "report",
            "label": "Relatorio final",
            "status": "ready" if report_ready else "pending",
            "summary": (
                f"{len(report_tool_calls)} tool(s) usadas no fechamento."
                if report_ready
                else "Relatorio final ainda nao consolidado."
            ),
        },
    ]

    current_stage_key = "context"
    if report_ready:
        current_stage_key = "report"
    elif turns_ready:
        current_stage_key = "turns"
    elif retrieval_ready:
        current_stage_key = "retrieval"
    elif context_ready:
        current_stage_key = "context"

    current_stage = next((item for item in stages if item["key"] == current_stage_key), stages[0])
    ready_count = sum(1 for item in stages if item["status"] == "ready")
    headline = _safe_str(last_runtime.get("headline"))

    summary = f"Workflow com {ready_count}/{len(stages)} etapa(s) prontas e {answer_count} resposta(s) auditada(s)."
    if retrieval_ready:
        summary += f" Retrieval {retrieval_mode} com qualidade {retrieval_quality}."
    if headline:
        summary += f" Ultimo runtime: {headline}."

    return {
        "currentStage": current_stage["key"],
        "currentStageLabel": current_stage["label"],
        "answerCount": answer_count,
        "contextToolCallCount": len(context_tool_calls),
        "reportToolCallCount": len(report_tool_calls),
        "retrievalMode": retrieval_mode if retrieval_ready else None,
        "retrievalQuality": retrieval_quality if retrieval_ready else None,
        "stages": stages,
        "lastRuntime": last_runtime or None,
        "summary": summary,
    }


def get_user_profile(uid: str) -> Dict[str, Any]:
    """Return a sanitized user profile from Firestore (safe fields only)."""
    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("MCP get_user_profile: Firestore init failed")
        return {}

    try:
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            return {}
        data = doc.to_dict() or {}
        allowed = {
            "uid": data.get("uid") or uid,
            "name": data.get("name") or data.get("displayName"),
            "email": data.get("email"),
            "plan": data.get("plan"),
            "credits": data.get("credits"),
            "lastInterviewAt": data.get("lastInterviewAt"),
        }
        # Remove null-ish values
        return {k: v for k, v in allowed.items() if v is not None}
    except Exception:
        logger.exception("MCP get_user_profile failed")
        return {}


def get_recent_interviews(uid: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Return recent interview summaries (safe fields only)."""
    try:
        limit_val = int(limit or 5)
    except Exception:
        limit_val = 5
    limit_val = max(1, min(limit_val, 20))
    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("MCP get_recent_interviews: Firestore init failed")
        return []

    try:
        items: List[Dict[str, Any]] = []
        q = (
            db.collection("users")
            .document(uid)
            .collection("interviews")
            .order_by("date", direction=firestore.Query.DESCENDING)
            .limit(limit_val)
        )
        for d in q.stream():
            data = d.to_dict() or {}
            items.append(
                {
                    "id": data.get("id"),
                    "date": data.get("date"),
                    "role": data.get("role"),
                    "score": data.get("score"),
                    "style": data.get("style"),
                    "track": data.get("track"),
                }
            )
        return items
    except Exception:
        logger.exception("MCP get_recent_interviews failed")
        return []


def get_session_trace(uid: str, session_id: str) -> Dict[str, Any]:
    """Return a sanitized session trace snapshot for a user-owned session."""
    safe_uid = _safe_str(uid)
    safe_session_id = _safe_str(session_id)
    if not safe_uid or not safe_session_id:
        return _tool_payload(
            "get_session_trace",
            {"sessionId": safe_session_id or "", "hasTrace": False, "analysisTraceSnapshot": None},
        )

    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("MCP get_session_trace: Firestore init failed")
        return _tool_payload(
            "get_session_trace",
            {"sessionId": safe_session_id, "hasTrace": False, "analysisTraceSnapshot": None},
        )

    try:
        doc = db.collection("sessions").document(safe_session_id).get()
        if not doc.exists:
            return _tool_payload(
                "get_session_trace",
                {"sessionId": safe_session_id, "hasTrace": False, "analysisTraceSnapshot": None},
            )

        data = doc.to_dict() or {}
        if data.get("uid") != safe_uid:
            return _tool_payload(
                "get_session_trace",
                {"sessionId": safe_session_id, "hasTrace": False, "analysisTraceSnapshot": None},
            )

        snapshot = data.get("analysisTraceSnapshot")
        has_trace = isinstance(snapshot, dict) and bool(snapshot)
        workflow_summary = _extract_workflow_summary(snapshot) if has_trace else None
        return _tool_payload(
            "get_session_trace",
            {
                "sessionId": safe_session_id,
                "hasTrace": has_trace,
                "analysisTraceSnapshot": snapshot if has_trace else None,
                "workflowSummary": workflow_summary,
                "summary": workflow_summary.get("summary") if isinstance(workflow_summary, dict) else None,
            },
        )
    except Exception:
        logger.exception("MCP get_session_trace failed")
        return _tool_payload(
            "get_session_trace",
            {"sessionId": safe_session_id, "hasTrace": False, "analysisTraceSnapshot": None},
        )


def get_candidate_memory(uid: str) -> Dict[str, Any]:
    """Return the sanitized consolidated candidate memory for a user."""
    safe_uid = _safe_str(uid)
    if not safe_uid:
        return _tool_payload("get_candidate_memory", {"userId": "", "hasMemory": False, "memory": None})

    try:
        raw = candidate_memory_repository.get_memory(safe_uid) or {}
    except Exception:
        logger.exception("MCP get_candidate_memory failed")
        return _tool_payload("get_candidate_memory", {"userId": safe_uid, "hasMemory": False, "memory": None})

    if not isinstance(raw, dict) or not raw:
        return _tool_payload("get_candidate_memory", {"userId": safe_uid, "hasMemory": False, "memory": None})

    recurring_gaps = _safe_list(raw.get("recurringGaps"), limit=8)
    strong_skills = _safe_list(raw.get("strongSkills"), limit=8)
    memory = {
        "skillProgress": raw.get("skillProgress") if isinstance(raw.get("skillProgress"), dict) else {},
        "recurringGaps": recurring_gaps,
        "strongSkills": strong_skills,
        "behaviorProfile": raw.get("behaviorProfile") if isinstance(raw.get("behaviorProfile"), dict) else None,
        "cultureFitSignals": raw.get("cultureFitSignals") if isinstance(raw.get("cultureFitSignals"), dict) else None,
        "updatedAt": raw.get("updatedAt"),
        "lastInterviewAt": raw.get("lastInterviewAt"),
        "summary": (
            f"{len(strong_skills)} skill(s) forte(s) e {len(recurring_gaps)} gap(s) recorrente(s) na memoria consolidada."
        ),
    }
    return _tool_payload("get_candidate_memory", {"userId": safe_uid, "hasMemory": True, "memory": memory})


def get_resume_analysis(uid: str) -> Dict[str, Any]:
    """Return the latest sanitized resume analysis for a user."""
    safe_uid = _safe_str(uid)
    if not safe_uid:
        return _tool_payload("get_resume_analysis", {"userId": "", "found": False, "analysis": None})

    try:
        page = resume_analysis_repository.list_resume_analyses(user_id=safe_uid, limit=1, offset=0)
    except Exception:
        logger.exception("MCP get_resume_analysis failed")
        return _tool_payload("get_resume_analysis", {"userId": safe_uid, "found": False, "analysis": None})

    items = page.get("items") if isinstance(page, dict) else []
    item = items[0] if isinstance(items, list) and items else None
    if not isinstance(item, dict):
        return _tool_payload("get_resume_analysis", {"userId": safe_uid, "found": False, "analysis": None})

    extraction = item.get("extraction") if isinstance(item.get("extraction"), dict) else {}
    match = item.get("match") if isinstance(item.get("match"), dict) else {}
    technologies = _safe_list(extraction.get("technologies"), limit=8)
    analysis = {
        "id": item.get("id"),
        "fileName": item.get("fileName"),
        "source": item.get("source"),
        "aiProvider": item.get("aiProvider"),
        "aiModel": item.get("aiModel"),
        "promptVersion": item.get("promptVersion"),
        "confidence": item.get("confidence"),
        "createdAt": item.get("createdAt"),
        "technologies": technologies,
        "experienceLevel": extraction.get("experienceLevel"),
        "resumeSummary": extraction.get("resumeSummary"),
        "match": {
            "matchScore": match.get("matchScore"),
            "strongSkills": _safe_list(match.get("strongSkills"), limit=6),
            "weakSkills": _safe_list(match.get("weakSkills"), limit=6),
            "missingSkills": _safe_list(match.get("missingSkills"), limit=6),
        },
        "summary": (
            f"Curriculo com {len(technologies)} tecnologia(s) mapeada(s)"
            + (f" e nivel {extraction.get('experienceLevel')}" if _safe_str(extraction.get("experienceLevel")) else "")
            + "."
        ),
    }
    return _tool_payload("get_resume_analysis", {"userId": safe_uid, "found": True, "analysis": analysis})


def get_job_analysis(uid: str) -> Dict[str, Any]:
    """Return the latest sanitized job analysis for a user."""
    safe_uid = _safe_str(uid)
    if not safe_uid:
        return _tool_payload("get_job_analysis", {"userId": "", "found": False, "analysis": None})

    try:
        page = job_analysis_repository.list_job_analyses(user_id=safe_uid, limit=1, offset=0)
    except Exception:
        logger.exception("MCP get_job_analysis failed")
        return _tool_payload("get_job_analysis", {"userId": safe_uid, "found": False, "analysis": None})

    items = page.get("items") if isinstance(page, dict) else []
    item = items[0] if isinstance(items, list) and items else None
    if not isinstance(item, dict):
        return _tool_payload("get_job_analysis", {"userId": safe_uid, "found": False, "analysis": None})

    analysis_raw = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    gap = item.get("gap") if isinstance(item.get("gap"), dict) else {}
    required_skills = _safe_list(analysis_raw.get("requiredSkills"), limit=8)
    interview_focus = _safe_list(analysis_raw.get("interviewFocus"), limit=6)
    analysis = {
        "id": item.get("id"),
        "source": item.get("source"),
        "aiProvider": item.get("aiProvider"),
        "aiModel": item.get("aiModel"),
        "promptVersion": item.get("promptVersion"),
        "confidence": item.get("confidence"),
        "createdAt": item.get("createdAt"),
        "roleTitleGuess": analysis_raw.get("roleTitleGuess"),
        "seniorityGuess": analysis_raw.get("seniorityGuess"),
        "requiredSkills": required_skills,
        "interviewFocus": interview_focus,
        "gap": {
            "matchScore": gap.get("matchScore"),
            "missingSkills": _safe_list(gap.get("missingSkills"), limit=6),
        },
        "summary": (
            f"Vaga com foco em {', '.join(required_skills[:4])}."
            if required_skills
            else "Vaga analisada sem skills obrigatorias explicitas."
        ),
    }
    return _tool_payload("get_job_analysis", {"userId": safe_uid, "found": True, "analysis": analysis})


def get_rubric(track: str, seniority: str, stacks: List[str], question: Optional[str] = None) -> Dict[str, Any]:
    """Return a lightweight rubric for evaluation prompts."""
    track_key = (track or "").lower()
    senior_key = (seniority or "").lower()
    stack_list = [s.strip() for s in (stacks or []) if _safe_str(s)]

    focus = ["clarity", "structure", "tradeoffs", "correctness"]
    good_signals = ["explains assumptions", "covers edge cases", "communicates clearly"]
    red_flags = ["vague answer", "no structure", "ignores constraints"]

    if "front" in track_key:
        focus += ["state management", "performance", "accessibility", "ui behavior"]
        good_signals += ["mentions rendering cost", "handles async state"]
        red_flags += ["ignores a11y", "over-renders"]
    elif "back" in track_key:
        focus += ["data modeling", "api design", "reliability", "scaling"]
        good_signals += ["mentions latency", "handles failures"]
        red_flags += ["no error handling", "no data model"]
    elif "data" in track_key or "ml" in track_key:
        focus += ["data quality", "pipelines", "metrics", "validation"]
        good_signals += ["talks about evaluation", "guards against leakage"]
        red_flags += ["no metrics", "no validation"]

    if "senior" in senior_key or "lead" in senior_key or "staff" in senior_key:
        focus += ["architecture", "risk", "alignment"]
        good_signals += ["discusses tradeoffs", "prioritizes risks"]
        red_flags += ["over-engineering", "no tradeoffs"]
    elif "junior" in senior_key or "estagio" in senior_key:
        focus += ["fundamentals", "debugging"]
        good_signals += ["asks clarifying questions", "thinks step by step"]
        red_flags += ["confused basics", "no plan"]

    # De-dup and keep it compact
    def _uniq(items: List[str]) -> List[str]:
        seen = set()
        out = []
        for item in items:
            key = item.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out

    return _tool_payload(
        "get_rubric",
        {
            "track": track,
            "seniority": seniority,
            "stacks": stack_list,
            "question": question,
            "focus": _uniq(focus)[:8],
            "good_signals": _uniq(good_signals)[:8],
            "red_flags": _uniq(red_flags)[:8],
        },
    )


def search_rubric_knowledge(track: str, seniority: str, stacks: List[str], question: Optional[str] = None) -> Dict[str, Any]:
    """Return a versioned rubric knowledge payload for tool use and debugger surfaces."""
    rubric = get_rubric(track=track, seniority=seniority, stacks=stacks, question=question)
    focus = _safe_list(rubric.get("focus"), limit=8)
    good = _safe_list(rubric.get("good_signals"), limit=8)
    red = _safe_list(rubric.get("red_flags"), limit=8)
    return _tool_payload(
        "search_rubric_knowledge",
        {
            "track": track,
            "seniority": seniority,
            "stacks": _safe_list(stacks, limit=10),
            "question": question,
            "focus": focus,
            "goodSignals": good,
            "redFlags": red,
            "summary": (
                f"Rubrica pronta para {track or 'trilha geral'} / {seniority or 'senioridade geral'} com {len(_safe_list(stacks, limit=10))} stack(s)."
            ),
        },
    )
