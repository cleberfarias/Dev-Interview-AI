from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .. import mcp_client, mcp_tools


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_stacks(stacks: list[str] | None) -> list[str]:
    if not isinstance(stacks, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in stacks:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out[:10]


def _build_item(name: str, label: str, payload: Any, empty_summary: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or not payload.get("toolName"):
        return {
            "name": name,
            "label": label,
            "contractVersion": None,
            "status": "error",
            "summary": "Tool indisponivel ou sem resposta valida.",
            "data": None,
        }

    status = "ready"
    if payload.get("hasTrace") is False or payload.get("found") is False or payload.get("hasMemory") is False:
        status = "empty"

    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = empty_summary

    return {
        "name": name,
        "label": label,
        "contractVersion": payload.get("contractVersion"),
        "status": status,
        "summary": summary,
        "data": payload,
    }


def _backfill_session_trace(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload

    snapshot = payload.get("analysisTraceSnapshot")
    has_trace = bool(payload.get("hasTrace")) and isinstance(snapshot, dict) and bool(snapshot)
    if not has_trace:
        return payload

    workflow_summary = payload.get("workflowSummary")
    if not isinstance(workflow_summary, dict) or not workflow_summary:
        workflow_summary = mcp_tools._extract_workflow_summary(snapshot)
        payload["workflowSummary"] = workflow_summary

    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        payload["summary"] = workflow_summary.get("summary") or "Trace da sessao pronto para auditoria."

    return payload


def get_mcp_tool_debugger(
    user: dict,
    *,
    session_id: str | None = None,
    track: str | None = None,
    seniority: str | None = None,
    stacks: list[str] | None = None,
    question: str | None = None,
) -> dict[str, Any]:
    uid = str(user.get("uid") or "").strip()
    auth_token = user.get("token")
    normalized_stacks = _normalize_stacks(stacks)

    candidate_memory = mcp_client.get_candidate_memory(uid, auth_token=auth_token)
    resume_analysis = mcp_client.get_resume_analysis(uid, auth_token=auth_token)
    job_analysis = mcp_client.get_job_analysis(uid, auth_token=auth_token)
    session_trace = (
        _backfill_session_trace(mcp_client.get_session_trace(uid, session_id, auth_token=auth_token))
        if session_id
        else {
            "toolName": "get_session_trace",
            "contractVersion": "mcp.devinterview.v1",
            "sessionId": None,
            "hasTrace": False,
            "analysisTraceSnapshot": None,
            "summary": "Nenhuma sessao selecionada para inspecao de trace.",
        }
    )
    rubric = mcp_client.search_rubric_knowledge(
        track=track or "frontend",
        seniority=seniority or "mid",
        stacks=normalized_stacks,
        question=question,
        auth_token=auth_token,
    )

    if isinstance(candidate_memory, dict) and not candidate_memory.get("summary"):
        memory = candidate_memory.get("memory") if isinstance(candidate_memory.get("memory"), dict) else {}
        candidate_memory["summary"] = memory.get("summary") or "Memoria consolidada indisponivel."

    if isinstance(resume_analysis, dict) and not resume_analysis.get("summary"):
        analysis = resume_analysis.get("analysis") if isinstance(resume_analysis.get("analysis"), dict) else {}
        resume_analysis["summary"] = analysis.get("summary") or "Nenhuma analise de curriculo encontrada."

    if isinstance(job_analysis, dict) and not job_analysis.get("summary"):
        analysis = job_analysis.get("analysis") if isinstance(job_analysis.get("analysis"), dict) else {}
        job_analysis["summary"] = analysis.get("summary") or "Nenhuma analise de vaga encontrada."

    if isinstance(session_trace, dict) and not session_trace.get("summary"):
        has_trace = bool(session_trace.get("hasTrace"))
        session_trace["summary"] = (
            "Trace da sessao pronto para auditoria." if has_trace else "Sessao sem snapshot de trace."
        )

    return {
        "generatedAt": _now_iso(),
        "sessionId": session_id,
        "tools": [
            _build_item(
                "get_candidate_memory",
                "Memoria consolidada",
                candidate_memory,
                "Memoria consolidada indisponivel.",
            ),
            _build_item(
                "get_resume_analysis",
                "Analise de curriculo",
                resume_analysis,
                "Nenhuma analise de curriculo encontrada.",
            ),
            _build_item(
                "get_job_analysis",
                "Analise de vaga",
                job_analysis,
                "Nenhuma analise de vaga encontrada.",
            ),
            _build_item(
                "get_session_trace",
                "Trace da ultima sessao",
                session_trace,
                "Sessao sem snapshot de trace.",
            ),
            _build_item(
                "search_rubric_knowledge",
                "Rubrica aplicada",
                rubric,
                "Rubrica indisponivel para a configuracao atual.",
            ),
        ],
    }
