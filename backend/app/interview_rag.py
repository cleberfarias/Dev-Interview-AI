from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .jobs.analyzer import analyze_job_description
from .knowledge_retrieval import (
    build_candidate_knowledge_documents,
    build_candidate_query_terms,
    build_candidate_query_text,
    build_knowledge_retrieval_from_documents,
)
from .repositories import session_repository
from .resume.extractor import extract_resume_data
from .resume.matcher import match_resume_to_job
from .services import candidate_profile_service, memory_service
from .schemas import InterviewConfig


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _normalize_tag(value: Any) -> str:
    return str(value or "").strip().lower()[:72]


def _normalize_list(value: Any, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        normalized = _normalize_tag(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_answer_id(value: Any, fallback: str) -> str:
    answer_id = str(value or "").strip()
    return answer_id or fallback


def _snippet(value: Any, limit: int = 180) -> str:
    text = _normalize_text(value)
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def build_episode_memory_entry(
    *,
    answer_id: str,
    question: str,
    transcript: str,
    evaluation: dict[str, Any] | None,
    communication_analysis: dict[str, Any] | None,
) -> dict[str, Any]:
    evaluation = evaluation if isinstance(evaluation, dict) else {}
    communication_analysis = communication_analysis if isinstance(communication_analysis, dict) else {}
    scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else {}
    behavior_profile = (
        communication_analysis.get("behaviorProfile")
        if isinstance(communication_analysis.get("behaviorProfile"), dict)
        else {}
    )
    culture_fit = (
        communication_analysis.get("cultureFitSignals")
        if isinstance(communication_analysis.get("cultureFitSignals"), dict)
        else {}
    )
    communication_signals = (
        communication_analysis.get("communicationSignals")
        if isinstance(communication_analysis.get("communicationSignals"), dict)
        else {}
    )

    return {
        "answerId": _safe_answer_id(answer_id, "answer"),
        "question": _normalize_text(question),
        "transcript": _normalize_text(transcript),
        "strengths": _normalize_list(evaluation.get("strengths"), limit=6),
        "improvements": _normalize_list(evaluation.get("improvements"), limit=6),
        "followUpNeeded": bool(evaluation.get("followUpNeeded")),
        "followUpQuestion": _normalize_text(evaluation.get("followUpQuestion")),
        "scores": {
            "communication": round(_safe_float(scores.get("communication")), 2),
            "technical": round(_safe_float(scores.get("technical")), 2),
            "problemSolving": round(_safe_float(scores.get("problemSolving")), 2),
            "presence": round(_safe_float(scores.get("presence")), 2),
        },
        "behaviorProfile": {
            "communicationStyle": _normalize_text(behavior_profile.get("communicationStyle")),
            "observedTraits": _normalize_list(behavior_profile.get("observedTraits"), limit=6),
        },
        "cultureFitSignals": {
            "overallAlignment": round(_safe_float(culture_fit.get("overallAlignment")), 2),
            "supportingSignals": _normalize_list(culture_fit.get("supportingSignals"), limit=6),
        },
        "communicationSignals": {
            "responseClarity": round(_safe_float(communication_signals.get("responseClarity")), 2),
            "responseConfidence": round(_safe_float(communication_signals.get("responseConfidence")), 2),
            "professionalCommunication": round(_safe_float(communication_signals.get("professionalCommunication")), 2),
        },
    }


def _episode_documents_from_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for index, item in enumerate(history[-6:]):
        if not isinstance(item, dict):
            continue
        answer_id = _safe_answer_id(item.get("answerId"), f"history-{index + 1}")
        question = _normalize_text(item.get("question"))
        transcript = _normalize_text(item.get("transcript") or (item.get("evaluation") or {}).get("transcript"))
        if not question and not transcript:
            continue

        evaluation = item.get("evaluation") if isinstance(item.get("evaluation"), dict) else {}
        scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else {}
        strengths = _normalize_list(evaluation.get("strengths"), limit=4)
        improvements = _normalize_list(evaluation.get("improvements"), limit=4)
        communication_analysis = (
            item.get("communicationAnalysis") if isinstance(item.get("communicationAnalysis"), dict) else {}
        )
        behavior_profile = (
            communication_analysis.get("behaviorProfile")
            if isinstance(communication_analysis.get("behaviorProfile"), dict)
            else {}
        )
        culture_fit = (
            communication_analysis.get("cultureFitSignals")
            if isinstance(communication_analysis.get("cultureFitSignals"), dict)
            else {}
        )

        parts = [
            f"Pergunta: {question}" if question else "",
            f"Resposta: {transcript}" if transcript else "",
            (
                "Scores: "
                f"communication {scores.get('communication')}, "
                f"technical {scores.get('technical')}, "
                f"problem solving {scores.get('problemSolving')}, "
                f"presence {scores.get('presence')}."
            )
            if scores
            else "",
            f"Strengths: {', '.join(strengths)}." if strengths else "",
            f"Improvements: {', '.join(improvements)}." if improvements else "",
            (
                f"Behavior: {behavior_profile.get('communicationStyle')} "
                f"with traits {', '.join(_normalize_list(behavior_profile.get('observedTraits'), limit=4))}."
            )
            if behavior_profile
            else "",
            (
                f"Culture fit overall alignment {culture_fit.get('overallAlignment')} "
                f"with signals {', '.join(_normalize_list(culture_fit.get('supportingSignals'), limit=4))}."
            )
            if culture_fit
            else "",
        ]
        text = " ".join(part for part in parts if part).strip()
        if not text:
            continue
        documents.append(
            {
                "id": f"episode-history-{answer_id}",
                "sourceType": "episode",
                "title": f"Evidencia da resposta {index + 1}",
                "text": text,
                "snippet": text,
                "tags": strengths + improvements + _normalize_list(behavior_profile.get("observedTraits"), limit=4),
                "baseScore": 0.69 if improvements else 0.64,
            }
        )
    return documents


def _episode_documents_from_session(session_id: str | None, user_id: str) -> list[dict[str, Any]]:
    if not session_id or not user_id:
        return []
    try:
        session = session_repository.get_session(session_id)
    except Exception:
        return []
    if not session or session.get("uid") != user_id:
        return []
    episodic_memory = session.get("episodicMemory") if isinstance(session.get("episodicMemory"), dict) else {}
    answers = episodic_memory.get("answers") if isinstance(episodic_memory.get("answers"), dict) else {}

    documents: list[dict[str, Any]] = []
    for index, (answer_id, item) in enumerate(answers.items()):
        if not isinstance(item, dict):
            continue
        question = _normalize_text(item.get("question"))
        transcript = _normalize_text(item.get("transcript"))
        strengths = _normalize_list(item.get("strengths"), limit=4)
        improvements = _normalize_list(item.get("improvements"), limit=4)
        behavior_profile = item.get("behaviorProfile") if isinstance(item.get("behaviorProfile"), dict) else {}
        culture_fit = item.get("cultureFitSignals") if isinstance(item.get("cultureFitSignals"), dict) else {}
        scores = item.get("scores") if isinstance(item.get("scores"), dict) else {}
        text = " ".join(
            part
            for part in [
                f"Pergunta: {question}" if question else "",
                f"Resposta: {transcript}" if transcript else "",
                (
                    "Scores: "
                    f"communication {scores.get('communication')}, "
                    f"technical {scores.get('technical')}, "
                    f"problem solving {scores.get('problemSolving')}, "
                    f"presence {scores.get('presence')}."
                )
                if scores
                else "",
                f"Strengths: {', '.join(strengths)}." if strengths else "",
                f"Improvements: {', '.join(improvements)}." if improvements else "",
                f"Behavior: {behavior_profile.get('communicationStyle')}." if behavior_profile else "",
                f"Culture fit alignment {culture_fit.get('overallAlignment')}." if culture_fit else "",
            ]
            if part
        ).strip()
        if not text:
            continue
        documents.append(
            {
                "id": f"episode-session-{answer_id}",
                "sourceType": "episode",
                "title": f"Memoria episodica {index + 1}",
                "text": text,
                "snippet": text,
                "tags": strengths + improvements,
                "baseScore": 0.72 if improvements else 0.66,
            }
        )
    return documents


def _history_answer_id(item: dict[str, Any], index: int) -> str:
    communication_analysis = item.get("communicationAnalysis") if isinstance(item.get("communicationAnalysis"), dict) else {}
    return _safe_answer_id(
        item.get("answerId") or communication_analysis.get("answerId"),
        f"history-{index + 1}",
    )


def _history_focus_terms(history: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in history[-4:]:
        if not isinstance(item, dict):
            continue
        evaluation = item.get("evaluation") if isinstance(item.get("evaluation"), dict) else {}
        scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else {}
        if _safe_float(scores.get("technical"), 10.0) < 7.0 and "technical-gap" not in seen:
            seen.add("technical-gap")
            out.append("technical-gap")
        if _safe_float(scores.get("communication"), 10.0) < 7.0 and "communication-gap" not in seen:
            seen.add("communication-gap")
            out.append("communication-gap")
        if _safe_float(scores.get("problemSolving"), 10.0) < 7.0 and "problem-solving-gap" not in seen:
            seen.add("problem-solving-gap")
            out.append("problem-solving-gap")
        for bucket in (
            _normalize_list(evaluation.get("improvements"), limit=5)
            + _normalize_list(evaluation.get("strengths"), limit=4)
        ):
            if bucket in seen:
                continue
            seen.add(bucket)
            out.append(bucket)
            if len(out) >= 10:
                return out
    return out


def _history_query_suffix(history: list[dict[str, Any]], purpose: str) -> str:
    latest = history[-1] if history and isinstance(history[-1], dict) else {}
    last_question = _normalize_text(latest.get("question"))
    last_transcript = _normalize_text(latest.get("transcript") or (latest.get("evaluation") or {}).get("transcript"))
    improvements = _normalize_list((latest.get("evaluation") or {}).get("improvements"), limit=4) if isinstance(latest, dict) else []
    parts = [
        f"Objetivo {purpose}",
        f"Ultima pergunta {last_question}" if last_question else "",
        f"Ultima resposta {last_transcript}" if last_transcript else "",
        f"Melhorias recentes {', '.join(improvements)}" if improvements else "",
    ]
    return ". ".join(part for part in parts if part).strip()


def _load_base_context(user: dict, config: InterviewConfig) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    try:
        profile = candidate_profile_service.get_candidate_profile(user).model_dump()
    except Exception:
        profile = {}
    try:
        candidate_memory = memory_service.load_candidate_memory(str(user.get("uid") or ""))
    except Exception:
        candidate_memory = {}
    resume_text = profile.get("resumeSummary") or ""
    parsed_resume = extract_resume_data(resume_text)
    candidate = {
        "skills": parsed_resume.get("technologies") or [],
        "seniority": parsed_resume.get("experienceLevel") or "unknown",
        "summary": parsed_resume.get("resumeSummary") or "",
        "profileContext": profile,
    }
    effective_job_description = (config.jobDescription or profile.get("jobDescription") or "").strip()
    job = analyze_job_description(effective_job_description)
    match = match_resume_to_job(
        candidate.get("skills") or profile.get("primarySkills") or config.stacks or [],
        effective_job_description,
    )
    return profile, candidate_memory, candidate, job, match


def _render_retrieval_context(retrieval: dict[str, Any], heading: str) -> str:
    sources = retrieval.get("sources") if isinstance(retrieval.get("sources"), list) else []
    top_sources = []
    for item in sources[:5]:
        if not isinstance(item, dict):
            continue
        top_sources.append(
            {
                "title": item.get("title"),
                "sourceType": item.get("sourceType"),
                "score": item.get("score"),
                "reason": item.get("reason"),
                "snippet": item.get("snippet"),
            }
        )
    payload = {
        "retrievalMode": retrieval.get("retrievalMode"),
        "quality": retrieval.get("quality"),
        "queryTerms": retrieval.get("queryTerms"),
        "sources": top_sources,
    }
    return f"\n{heading}:\n{json.dumps(payload, ensure_ascii=True)}\n"


def _render_episode_highlights(documents: list[dict[str, Any]], heading: str, limit: int = 2) -> str:
    highlights: list[dict[str, Any]] = []
    for item in documents[:limit]:
        if not isinstance(item, dict):
            continue
        highlights.append(
            {
                "title": item.get("title"),
                "snippet": item.get("snippet"),
                "tags": item.get("tags"),
            }
        )
    if not highlights:
        return ""
    return f"\n{heading}:\n{json.dumps(highlights, ensure_ascii=True)}\n"


def _compact_retrieval_sources(retrieval: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
    sources = retrieval.get("sources") if isinstance(retrieval.get("sources"), list) else []
    compact_sources: list[dict[str, Any]] = []
    for item in sources[:limit]:
        if not isinstance(item, dict):
            continue
        compact_sources.append(
            {
                "title": item.get("title"),
                "sourceType": item.get("sourceType"),
                "score": item.get("score"),
                "reason": item.get("reason"),
            }
        )
    return compact_sources


def _compact_history_highlights(history: list[dict[str, Any]], limit: int = 2) -> list[dict[str, Any]]:
    highlights: list[dict[str, Any]] = []
    tail = history[-limit:] if limit > 0 else history
    for index, item in enumerate(tail):
        if not isinstance(item, dict):
            continue
        evaluation = item.get("evaluation") if isinstance(item.get("evaluation"), dict) else {}
        answer_id = _history_answer_id(item, index)
        highlights.append(
            {
                "answerId": answer_id,
                "question": _normalize_text(item.get("question")),
                "transcriptSnippet": _snippet(
                    item.get("transcript") or evaluation.get("transcript"),
                    limit=160,
                ),
                "strengths": _normalize_list(evaluation.get("strengths"), limit=4),
                "improvements": _normalize_list(evaluation.get("improvements"), limit=4),
                "clientRuntime": _compact_client_runtime(item.get("clientRuntime")),
            }
        )
    return highlights


def _compact_client_runtime(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    compact = {
        "headline": _normalize_text(value.get("headline")),
        "tone": _normalize_text(value.get("tone")),
        "questionDeliveryLatencyMs": round(_safe_float(value.get("questionDeliveryLatencyMs")), 2)
        if value.get("questionDeliveryLatencyMs") is not None
        else None,
        "analysisLatencyMs": round(_safe_float(value.get("analysisLatencyMs")), 2)
        if value.get("analysisLatencyMs") is not None
        else None,
        "stageElapsedMs": round(_safe_float(value.get("stageElapsedMs")), 2)
        if value.get("stageElapsedMs") is not None
        else None,
        "sessionElapsedSeconds": round(_safe_float(value.get("sessionElapsedSeconds")), 2)
        if value.get("sessionElapsedSeconds") is not None
        else None,
        "pendingChunkCount": int(_safe_float(value.get("pendingChunkCount")))
        if value.get("pendingChunkCount") is not None
        else None,
        "partialTranscriptActive": bool(value.get("partialTranscriptActive")) if value.get("partialTranscriptActive") is not None else None,
        "partialFeedbackVisible": bool(value.get("partialFeedbackVisible")) if value.get("partialFeedbackVisible") is not None else None,
        "showLiveCoachPanel": bool(value.get("showLiveCoachPanel")) if value.get("showLiveCoachPanel") is not None else None,
        "transportState": _normalize_text(value.get("transportState")),
        "progressState": _normalize_text(value.get("progressState")),
        "avatarState": _normalize_text(value.get("avatarState")),
        "coachState": _normalize_text(value.get("coachState")),
    }
    compact = {key: item for key, item in compact.items() if item not in (None, "", [])}
    return compact or None


def build_next_question_rag_trace(
    *,
    history: list[dict[str, Any]],
    retrieval: dict[str, Any],
) -> dict[str, Any] | None:
    latest_index = len(history) - 1
    if latest_index < 0:
        return None
    latest = history[latest_index]
    if not isinstance(latest, dict):
        return None

    evaluation = latest.get("evaluation") if isinstance(latest.get("evaluation"), dict) else {}
    scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else {}
    answer_id = _history_answer_id(latest, latest_index)
    return {
        "answerId": answer_id,
        "capturedAt": _now_iso(),
        "question": _normalize_text(latest.get("question")),
        "transcriptSnippet": _snippet(
            latest.get("transcript") or evaluation.get("transcript"),
            limit=180,
        ),
        "strengths": _normalize_list(evaluation.get("strengths"), limit=4),
        "improvements": _normalize_list(evaluation.get("improvements"), limit=4),
        "clientRuntime": _compact_client_runtime(latest.get("clientRuntime")),
        "scores": {
            "communication": round(_safe_float(scores.get("communication")), 2),
            "technical": round(_safe_float(scores.get("technical")), 2),
            "problemSolving": round(_safe_float(scores.get("problemSolving")), 2),
            "presence": round(_safe_float(scores.get("presence")), 2),
        },
        "nextQuestionContext": {
            "quality": retrieval.get("quality"),
            "retrievalMode": retrieval.get("retrievalMode"),
            "queryTerms": list(retrieval.get("queryTerms") or [])[:6],
            "sources": _compact_retrieval_sources(retrieval, limit=3),
            "episodeHighlights": _compact_history_highlights(history, limit=2),
        },
    }


def build_report_rag_trace(
    *,
    history: list[dict[str, Any]],
    retrieval: dict[str, Any],
) -> dict[str, Any]:
    return {
        "capturedAt": _now_iso(),
        "quality": retrieval.get("quality"),
        "retrievalMode": retrieval.get("retrievalMode"),
        "queryTerms": list(retrieval.get("queryTerms") or [])[:8],
        "sources": _compact_retrieval_sources(retrieval, limit=4),
        "episodeHighlights": _compact_history_highlights(history, limit=4),
    }


def build_next_question_rag_context(
    *,
    user: dict,
    config: InterviewConfig,
    history: list[dict[str, Any]],
    session_id: str | None = None,
) -> tuple[str, dict[str, Any]]:
    user_id = str(user.get("uid") or "")
    profile, candidate_memory, candidate, job, match = _load_base_context(user, config)
    query_terms = build_candidate_query_terms(
        config=config,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )
    query_terms = query_terms + [term for term in _history_focus_terms(history) if term not in query_terms]
    query_text = (
        build_candidate_query_text(
            config=config,
            profile=profile,
            candidate_memory=candidate_memory,
            candidate=candidate,
            job=job,
            query_terms=query_terms,
        )
        + ". "
        + _history_query_suffix(history, "proxima pergunta")
    ).strip()
    documents = build_candidate_knowledge_documents(
        user_id=user_id,
        auth_token=user.get("token"),
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )
    episode_documents = _episode_documents_from_session(session_id, user_id)
    history_episode_documents = _episode_documents_from_history(history)
    documents.extend(episode_documents)
    documents.extend(history_episode_documents)
    retrieval = build_knowledge_retrieval_from_documents(
        user_id=user_id,
        query_text=query_text,
        query_terms=query_terms,
        documents=documents,
        match_score=match.get("matchScore"),
        limit=6,
        summary_text="Contexto recuperado para orientar a proxima pergunta com memoria episodica.",
    )
    explicit_episode_context = _render_episode_highlights(
        history_episode_documents or episode_documents,
        "Memoria episodica recente para a proxima pergunta",
    )
    return (
        _render_retrieval_context(retrieval, "Contexto RAG semantico para a proxima pergunta")
        + explicit_episode_context,
        retrieval,
    )


def build_report_rag_context(
    *,
    user: dict,
    config: InterviewConfig,
    history: list[dict[str, Any]],
    session_id: str | None = None,
) -> tuple[str, dict[str, Any]]:
    user_id = str(user.get("uid") or "")
    profile, candidate_memory, candidate, job, match = _load_base_context(user, config)
    query_terms = build_candidate_query_terms(
        config=config,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )
    query_terms = query_terms + [term for term in _history_focus_terms(history) if term not in query_terms]
    query_text = (
        build_candidate_query_text(
            config=config,
            profile=profile,
            candidate_memory=candidate_memory,
            candidate=candidate,
            job=job,
            query_terms=query_terms,
        )
        + ". "
        + _history_query_suffix(history, "relatorio final")
    ).strip()
    documents = build_candidate_knowledge_documents(
        user_id=user_id,
        auth_token=user.get("token"),
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )
    episode_documents = _episode_documents_from_session(session_id, user_id)
    history_episode_documents = _episode_documents_from_history(history)
    documents.extend(episode_documents)
    documents.extend(history_episode_documents)
    retrieval = build_knowledge_retrieval_from_documents(
        user_id=user_id,
        query_text=query_text,
        query_terms=query_terms,
        documents=documents,
        match_score=match.get("matchScore"),
        limit=8,
        summary_text="Contexto recuperado para consolidar o relatorio final com evidencias reais da entrevista.",
    )
    explicit_episode_context = _render_episode_highlights(
        history_episode_documents or episode_documents,
        "Memoria episodica recente para o relatorio final",
    )
    return (
        _render_retrieval_context(retrieval, "Contexto RAG semantico para o relatorio final")
        + explicit_episode_context,
        retrieval,
    )
