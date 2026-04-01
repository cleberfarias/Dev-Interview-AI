from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .mcp_client import get_rubric as mcp_get_rubric, search_rubric_knowledge as mcp_search_rubric_knowledge
from .repositories import user_repository
from .semantic_index import rank_documents

_STOPWORDS = {
    "a",
    "ao",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "que",
    "se",
    "sem",
    "um",
    "uma",
}


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


def _tokenize(value: Any, limit: int = 24) -> list[str]:
    text = _normalize_text(value).lower()
    if not text:
        return []
    raw = "".join(ch if ch.isalnum() or ch in {" ", "-", "_"} else " " for ch in text)
    out: list[str] = []
    seen: set[str] = set()
    for token in raw.replace("_", " ").replace("-", " ").split():
        token = token.strip()
        if len(token) <= 2 or token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= limit:
            break
    return out


def _snippet(value: Any, limit: int = 220) -> str:
    text = _normalize_text(value)
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _quality_label(score: float) -> str:
    if score >= 0.8:
        return "strong"
    if score >= 0.65:
        return "good"
    if score >= 0.45:
        return "moderate"
    return "initial"


def _build_reason(source_type: str, overlap: list[str], semantic_score: float) -> str:
    if overlap and semantic_score >= 0.68:
        return f"Recuperado por similaridade semantica e sobreposicao de contexto: {', '.join(overlap)}."
    if overlap:
        return f"Recuperado por sobreposicao de contexto: {', '.join(overlap)}."
    if semantic_score >= 0.72:
        return "Recuperado por similaridade semantica com o contexto ativo."
    if source_type == "history":
        return "Recuperado por relevancia de historico recente do candidato."
    if source_type == "memory":
        return "Recuperado da memoria consolidada de skills e gaps."
    if source_type == "rubric":
        return "Recuperado da rubrica para trilha, senioridade e stacks."
    return "Recuperado para fortalecer o contexto ativo antes da entrevista."


def _chunk_text(value: Any, max_chars: int = 420) -> list[str]:
    text = _normalize_text(value)
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    sentences = [segment.strip() for segment in text.replace("\n", " ").split(".") if segment.strip()]
    if not sentences:
        return [_snippet(text, limit=max_chars)]

    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current}. {sentence}".strip(". ").strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current.strip())
        current = sentence
    if current:
        chunks.append(current.strip())
    return chunks[:3] or [_snippet(text, limit=max_chars)]


def _normalize_rubric_payload(value: Any) -> tuple[list[str], list[str], list[str]]:
    if not isinstance(value, dict):
        return [], [], []
    focus = _normalize_list(value.get("focus"), limit=6)
    good = _normalize_list(value.get("goodSignals") or value.get("good_signals"), limit=6)
    red = _normalize_list(value.get("redFlags") or value.get("red_flags"), limit=6)
    return focus, good, red


def _document_payload(
    *,
    source_id: str,
    source_type: str,
    title: str,
    text: str,
    base_score: float,
    tags: list[str],
    captured_at: str | None = None,
    chunked: bool = False,
) -> list[dict[str, Any]]:
    clean_text = _normalize_text(text)
    if not clean_text:
        return []

    parts = _chunk_text(clean_text) if chunked else [clean_text]
    out: list[dict[str, Any]] = []
    total_parts = len(parts)
    for index, part in enumerate(parts, start=1):
        item_title = title if total_parts == 1 else f"{title} {index}"
        item_id = source_id if total_parts == 1 else f"{source_id}-{index}"
        payload: dict[str, Any] = {
            "id": item_id,
            "sourceType": source_type,
            "title": item_title,
            "text": part,
            "snippet": _snippet(part),
            "baseScore": round(float(base_score), 2),
            "tags": _normalize_list(tags, limit=10),
        }
        if captured_at:
            payload["capturedAt"] = captured_at
        out.append(payload)
    return out


def _recent_interview_documents(user_id: str) -> list[dict[str, Any]]:
    if not user_id:
        return []
    try:
        recent = user_repository.list_user_interviews(user_id, limit=4)
    except Exception:
        return []

    out: list[dict[str, Any]] = []
    for index, item in enumerate(recent):
        if not isinstance(item, dict):
            continue
        date = _normalize_text(item.get("date"))
        role = _normalize_text(item.get("role") or "Entrevista")
        track = _normalize_text(item.get("track"))
        style = _normalize_text(item.get("style"))
        score = item.get("score")
        summary = (
            f"{role}. Track {track or 'geral'}. Estilo {style or 'nao definido'}. "
            f"Score {score}. Use essa sessao para recuperar sinais recentes de desempenho."
        )
        out.extend(
            _document_payload(
                source_id=f"history-{index + 1}",
                source_type="history",
                title=f"Historico recente {index + 1}",
                text=summary,
                base_score=0.58,
                tags=[role, track, style],
                captured_at=date or None,
            )
        )
    return out


def _query_terms(
    *,
    config: Any | None,
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
) -> list[str]:
    config_track = _normalize_text(getattr(config, "track", None) if config is not None else None)
    config_seniority = _normalize_text(getattr(config, "seniority", None) if config is not None else None)
    config_stacks = _normalize_list(getattr(config, "stacks", []) if config is not None else [], limit=10)

    merged = (
        _normalize_list(candidate.get("skills"), limit=10)
        + _normalize_list(job.get("requiredSkills"), limit=10)
        + _normalize_list(job.get("interviewFocus"), limit=8)
        + _normalize_list(candidate_memory.get("recurringGaps"), limit=10)
        + _normalize_list(candidate_memory.get("strongSkills"), limit=10)
        + config_stacks
        + _tokenize(config_track, limit=4)
        + _tokenize(config_seniority, limit=4)
    )

    out: list[str] = []
    seen: set[str] = set()
    for item in merged:
        normalized = _normalize_tag(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
        if len(out) >= 16:
            break
    return out


def _query_text(
    *,
    config: Any | None,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
    query_terms: list[str],
) -> str:
    track = _normalize_text(getattr(config, "track", None) if config is not None else None)
    seniority = _normalize_text(getattr(config, "seniority", None) if config is not None else None)
    resume_summary = _normalize_text(profile.get("resumeSummary") or candidate.get("summary"))
    role_guess = _normalize_text(job.get("roleTitleGuess") or profile.get("targetRole"))
    gaps = _normalize_list(candidate_memory.get("recurringGaps"), limit=6)
    strong_skills = _normalize_list(candidate_memory.get("strongSkills"), limit=6)
    job_focus = _normalize_list(job.get("requiredSkills"), limit=8) + _normalize_list(job.get("interviewFocus"), limit=6)

    parts = [
        f"Track {track or 'geral'}",
        f"Senioridade {seniority or 'nao definida'}",
        f"Role {role_guess or 'software engineer'}",
        f"Query terms {', '.join(query_terms[:10])}" if query_terms else "",
        f"Resumo {resume_summary}" if resume_summary else "",
        f"Skills fortes {', '.join(strong_skills)}" if strong_skills else "",
        f"Gaps recorrentes {', '.join(gaps)}" if gaps else "",
        f"Foco da vaga {', '.join(job_focus[:10])}" if job_focus else "",
    ]
    return ". ".join(part for part in parts if part).strip()


def _candidate_documents(
    *,
    user_id: str,
    auth_token: str | None,
    config: Any | None,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []

    resume_summary = _normalize_text(profile.get("resumeSummary") or candidate.get("summary"))
    if resume_summary:
        documents.extend(
            _document_payload(
                source_id="resume-summary",
                source_type="resume",
                title="Resumo do curriculo",
                text=resume_summary,
                base_score=0.58,
                tags=_normalize_list(profile.get("primarySkills"), limit=8),
                chunked=True,
            )
        )

    candidate_skills = _normalize_list(candidate.get("skills") or profile.get("primarySkills"), limit=10)
    if candidate_skills:
        documents.extend(
            _document_payload(
                source_id="candidate-skills",
                source_type="resume",
                title="Skills do candidato",
                text=f"Skills mapeadas: {', '.join(candidate_skills)}.",
                base_score=0.62,
                tags=candidate_skills,
            )
        )

    job_description = _normalize_text(profile.get("jobDescription"))
    if job_description:
        documents.extend(
            _document_payload(
                source_id="job-description",
                source_type="job",
                title="Descricao da vaga",
                text=job_description,
                base_score=0.65,
                tags=_normalize_list(job.get("requiredSkills"), limit=8),
                chunked=True,
            )
        )

    job_focus_bits = _normalize_list(job.get("requiredSkills"), limit=8) + _normalize_list(job.get("interviewFocus"), limit=6)
    if job_focus_bits:
        documents.extend(
            _document_payload(
                source_id="job-focus",
                source_type="job",
                title="Foco tecnico da vaga",
                text=f"Prioridades da vaga: {', '.join(job_focus_bits)}.",
                base_score=0.67,
                tags=job_focus_bits,
            )
        )

    recurring_gaps = _normalize_list(candidate_memory.get("recurringGaps"), limit=8)
    strong_skills = _normalize_list(candidate_memory.get("strongSkills"), limit=8)
    if recurring_gaps or strong_skills:
        memory_bits: list[str] = []
        if recurring_gaps:
            memory_bits.append(f"Gaps recorrentes: {', '.join(recurring_gaps)}")
        if strong_skills:
            memory_bits.append(f"Skills fortes: {', '.join(strong_skills)}")
        documents.extend(
            _document_payload(
                source_id="candidate-memory",
                source_type="memory",
                title="Memoria consolidada",
                text=". ".join(memory_bits),
                base_score=0.64,
                tags=recurring_gaps + strong_skills,
                chunked=True,
            )
        )

    documents.extend(_recent_interview_documents(user_id))

    config_track = _normalize_text(getattr(config, "track", None) if config is not None else None)
    config_seniority = _normalize_text(getattr(config, "seniority", None) if config is not None else None)
    config_stacks = _normalize_list(getattr(config, "stacks", []) if config is not None else [], limit=10)
    if auth_token and config_track and config_seniority:
        rubric = None
        try:
            rubric = mcp_search_rubric_knowledge(
                track=config_track or "backend",
                seniority=config_seniority or "mid",
                stacks=config_stacks,
                question=None,
                auth_token=auth_token,
            )
        except Exception:
            rubric = None
        rubric_focus, rubric_good, rubric_red = _normalize_rubric_payload(rubric)
        if not (rubric_focus or rubric_good or rubric_red):
            try:
                rubric = mcp_get_rubric(
                    track=config_track or "backend",
                    seniority=config_seniority or "mid",
                    stacks=config_stacks,
                    question=None,
                    auth_token=auth_token,
                )
            except Exception:
                rubric = None
            rubric_focus, rubric_good, rubric_red = _normalize_rubric_payload(rubric)
        if rubric_focus or rubric_good or rubric_red:
            rubric_bits: list[str] = []
            if rubric_focus:
                rubric_bits.append(f"Foco: {', '.join(rubric_focus)}")
            if rubric_good:
                rubric_bits.append(f"Bons sinais: {', '.join(rubric_good)}")
            if rubric_red:
                rubric_bits.append(f"Red flags: {', '.join(rubric_red)}")
            documents.extend(
                _document_payload(
                    source_id="rubric",
                    source_type="rubric",
                    title="Rubrica de avaliacao",
                    text=". ".join(rubric_bits),
                    base_score=0.63,
                    tags=rubric_focus + rubric_good,
                    chunked=True,
                )
            )

    return [item for item in documents if isinstance(item, dict) and _normalize_text(item.get("text"))]


def build_candidate_query_terms(
    *,
    config: Any | None,
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
) -> list[str]:
    return _query_terms(
        config=config,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )


def build_candidate_query_text(
    *,
    config: Any | None,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
    query_terms: list[str],
) -> str:
    return _query_text(
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
        query_terms=query_terms,
    )


def build_candidate_knowledge_documents(
    *,
    user_id: str,
    auth_token: str | None = None,
    config: Any | None = None,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
) -> list[dict[str, Any]]:
    return _candidate_documents(
        user_id=user_id,
        auth_token=auth_token,
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )


def build_knowledge_retrieval_from_documents(
    *,
    user_id: str,
    query_text: str,
    query_terms: list[str],
    documents: list[dict[str, Any]],
    match_score: Any = None,
    limit: int = 5,
    summary_text: str | None = None,
) -> dict[str, Any]:
    ranked = rank_documents(
        user_id=user_id,
        documents=documents,
        query_text=query_text,
        query_terms=query_terms,
        limit=max(1, int(limit)),
    )
    sources: list[dict[str, Any]] = []
    for item in ranked.get("items") or []:
        if not isinstance(item, dict):
            continue
        source_type = str(item.get("sourceType") or "").strip() or "resume"
        overlap = [str(value).strip() for value in (item.get("overlap") or []) if str(value).strip()]
        semantic_score = float(item.get("semanticScore") or 0.0)
        payload: dict[str, Any] = {
            "id": str(item.get("id") or "").strip(),
            "sourceType": source_type,
            "title": _normalize_text(item.get("title")),
            "snippet": _snippet(item.get("snippet") or item.get("text")),
            "score": round(float(item.get("score") or 0.0), 2),
            "reason": _build_reason(source_type, overlap[:4], semantic_score),
            "tags": _normalize_list(item.get("tags"), limit=8),
            "semanticScore": round(semantic_score, 2),
            "lexicalScore": round(float(item.get("lexicalScore") or 0.0), 2),
        }
        captured_at = _normalize_text(item.get("capturedAt"))
        if captured_at:
            payload["capturedAt"] = captured_at
        sources.append(payload)

    coverage = {
        "resume": any(item.get("sourceType") == "resume" for item in sources),
        "job": any(item.get("sourceType") == "job" for item in sources),
        "memory": any(item.get("sourceType") == "memory" for item in sources),
        "history": any(item.get("sourceType") == "history" for item in sources),
        "rubric": any(item.get("sourceType") == "rubric" for item in sources),
        "episode": any(item.get("sourceType") == "episode" for item in sources),
    }
    top_scores = [float(item.get("score") or 0.0) for item in sources[:3]]
    average_score = round(sum(top_scores) / len(top_scores), 2) if top_scores else 0.0

    return {
        "summary": summary_text or f"{len(sources)} fonte(s) conectadas ao contexto ativo por retrieval semantico.",
        "quality": _quality_label(average_score),
        "score": average_score,
        "queryTerms": query_terms[:8],
        "coverage": coverage,
        "sources": sources,
        "matchScore": match_score,
        "retrievalMode": ranked.get("retrievalMode") or "semantic",
        "indexStats": ranked.get("indexStats") or {},
        "generatedAt": _now_iso(),
    }


def build_knowledge_retrieval(
    *,
    user_id: str,
    auth_token: str | None = None,
    config: Any | None = None,
    profile: dict[str, Any],
    candidate_memory: dict[str, Any],
    candidate: dict[str, Any],
    job: dict[str, Any],
    match: dict[str, Any],
    limit: int = 5,
) -> dict[str, Any]:
    profile = profile if isinstance(profile, dict) else {}
    candidate_memory = candidate_memory if isinstance(candidate_memory, dict) else {}
    candidate = candidate if isinstance(candidate, dict) else {}
    job = job if isinstance(job, dict) else {}
    match = match if isinstance(match, dict) else {}

    query_terms = build_candidate_query_terms(
        config=config,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )
    query_text = build_candidate_query_text(
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
        query_terms=query_terms,
    )
    documents = build_candidate_knowledge_documents(
        user_id=user_id,
        auth_token=auth_token,
        config=config,
        profile=profile,
        candidate_memory=candidate_memory,
        candidate=candidate,
        job=job,
    )

    return build_knowledge_retrieval_from_documents(
        user_id=user_id,
        query_text=query_text,
        query_terms=query_terms,
        documents=documents,
        match_score=match.get("matchScore"),
        limit=limit,
        summary_text=None,
    )
