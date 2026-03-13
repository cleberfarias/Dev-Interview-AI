from __future__ import annotations

import os
import re

from fastapi import HTTPException

from ..ai.router import AIProviderError
from ..schemas import AnswerEvaluation, InterviewConfig


_DIMENSIONS = ("communication", "technical", "problemSolving", "presence")
_CRITERIA = ("clarity", "structure", "relevance", "technicalPrecision", "communication")
_REASON_TOKENS = {"because", "therefore", "tradeoff", "however", "porque", "portanto", "logo"}
_STRUCTURE_TOKENS = {
    "first",
    "second",
    "then",
    "finally",
    "step",
    "primeiro",
    "segundo",
    "depois",
    "entao",
    "então",
    "fim",
    "passo",
}


def _clamp_score(value: float) -> float:
    try:
        numeric = float(value)
    except Exception:
        numeric = 0.0
    return round(max(0.0, min(10.0, numeric)), 2)


def _extract_words(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9\+\#\.\-]+", text.lower())


def _heuristic_scores(transcript: str, config: InterviewConfig, question: str) -> tuple[dict[str, float], dict[str, float]]:
    words = _extract_words(transcript)
    word_count = len(words)
    sentences = max(1, len(re.findall(r"[.!?]+", transcript)))
    avg_sentence = word_count / sentences

    question_tokens = {t for t in _extract_words(question) if len(t) > 3}
    stack_tokens = {s.lower() for s in (config.stacks or [])}
    words_set = set(words)

    question_hits = len(question_tokens & words_set)
    stack_hits = len(stack_tokens & words_set)
    reason_hits = len({w for w in words_set if w in _REASON_TOKENS})
    structure_hits = len({w for w in words_set if w in _STRUCTURE_TOKENS})

    clarity = 3.0 + min(3.0, word_count / 35.0) + min(2.0, avg_sentence / 14.0)
    structure = 2.8 + min(2.8, structure_hits * 1.1) + min(2.4, reason_hits * 0.8)
    relevance = 2.8 + min(4.0, question_hits * 0.9) + min(1.8, word_count / 55.0)
    technical_precision = 2.4 + min(4.2, stack_hits * 1.2) + min(2.0, question_hits * 0.5)
    communication = 3.2 + min(3.0, word_count / 38.0) + min(2.0, avg_sentence / 15.0)

    criteria_scores = {
        "clarity": _clamp_score(clarity),
        "structure": _clamp_score(structure),
        "relevance": _clamp_score(relevance),
        "technicalPrecision": _clamp_score(technical_precision),
        "communication": _clamp_score(communication),
    }
    legacy_scores = _criteria_to_legacy(criteria_scores)
    return legacy_scores, criteria_scores


def _first_numeric(candidates: list[dict], aliases: tuple[str, ...]) -> float | None:
    for source in candidates:
        if not isinstance(source, dict):
            continue
        for key in aliases:
            if key in source:
                try:
                    return float(source.get(key))
                except Exception:
                    continue
    return None


def _extract_legacy_scores(payload: dict) -> dict[str, float | None]:
    score_map = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    candidates = [score_map, payload]
    aliases = {
        "communication": ("communication", "comunicacao", "comunicação"),
        "technical": ("technical", "tecnico", "técnico", "technicalScore"),
        "problemSolving": (
            "problemSolving",
            "problem_solving",
            "problem solving",
            "resolucaoProblemas",
            "resolucao_problemas",
        ),
        "presence": ("presence", "posture", "postura", "confidence"),
    }
    return {dimension: _first_numeric(candidates, aliases[dimension]) for dimension in _DIMENSIONS}


def _extract_criteria_scores(payload: dict) -> dict[str, float | None]:
    score_map = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    criteria_map = payload.get("criteriaScores") if isinstance(payload.get("criteriaScores"), dict) else {}
    criteria_alt = payload.get("criteria") if isinstance(payload.get("criteria"), dict) else {}
    candidates = [criteria_map, criteria_alt, score_map, payload]
    aliases = {
        "clarity": ("clarity", "clareza"),
        "structure": ("structure", "estrutura"),
        "relevance": ("relevance", "relevancia", "relevância"),
        "technicalPrecision": (
            "technicalPrecision",
            "technical_precision",
            "precisaoTecnica",
            "precisao_tecnica",
            "precisão_técnica",
        ),
        "communication": ("communication", "comunicacao", "comunicação"),
    }
    return {criterion: _first_numeric(candidates, aliases[criterion]) for criterion in _CRITERIA}


def _criteria_to_legacy(criteria_scores: dict[str, float]) -> dict[str, float]:
    communication = 0.6 * criteria_scores.get("communication", 0) + 0.4 * criteria_scores.get("clarity", 0)
    technical = 0.7 * criteria_scores.get("technicalPrecision", 0) + 0.3 * criteria_scores.get("relevance", 0)
    problem_solving = 0.6 * criteria_scores.get("structure", 0) + 0.4 * criteria_scores.get("relevance", 0)
    presence = 0.5 * criteria_scores.get("communication", 0) + 0.5 * criteria_scores.get("clarity", 0)

    return {
        "communication": _clamp_score(communication),
        "technical": _clamp_score(technical),
        "problemSolving": _clamp_score(problem_solving),
        "presence": _clamp_score(presence),
    }


def _legacy_to_criteria(legacy_scores: dict[str, float]) -> dict[str, float]:
    clarity = 0.5 * legacy_scores.get("communication", 0) + 0.5 * legacy_scores.get("presence", 0)
    structure = legacy_scores.get("problemSolving", 0)
    relevance = 0.5 * legacy_scores.get("technical", 0) + 0.5 * legacy_scores.get("problemSolving", 0)
    technical_precision = legacy_scores.get("technical", 0)
    communication = legacy_scores.get("communication", 0)

    return {
        "clarity": _clamp_score(clarity),
        "structure": _clamp_score(structure),
        "relevance": _clamp_score(relevance),
        "technicalPrecision": _clamp_score(technical_precision),
        "communication": _clamp_score(communication),
    }


def _blend_scores(ai_scores: dict, heuristic: dict, blend: float, keys: tuple[str, ...]) -> dict[str, float]:
    final: dict[str, float] = {}
    for dimension in keys:
        ai_val = _clamp_score(ai_scores.get(dimension, 0))
        h_val = _clamp_score(heuristic.get(dimension, 0))
        score = (1.0 - blend) * ai_val + blend * h_val
        final[dimension] = _clamp_score(score)
    return final


def _default_strengths(criteria_scores: dict[str, float]) -> list[str]:
    sorted_dims = sorted(criteria_scores.items(), key=lambda kv: kv[1], reverse=True)
    mapping = {
        "clarity": "Voce explicou de forma clara e facil de acompanhar.",
        "structure": "A resposta teve boa estrutura de raciocinio.",
        "relevance": "Voce se manteve aderente ao que a pergunta pedia.",
        "technicalPrecision": "Demonstrou boa precisao tecnica nos conceitos.",
        "communication": "Comunicacao segura, com ritmo e objetividade.",
    }
    items = [mapping[k] for k, _ in sorted_dims[:2]]
    return items if items else ["Resposta objetiva e alinhada ao contexto."]


def _default_improvements(criteria_scores: dict[str, float], config: InterviewConfig, transcript: str) -> list[str]:
    sorted_dims = sorted(criteria_scores.items(), key=lambda kv: kv[1])
    mapping = {
        "clarity": "Deixe a explicacao mais direta, evitando saltos de contexto.",
        "structure": "Organize a resposta em passos claros (contexto, decisao, resultado).",
        "relevance": "Conecte cada ponto ao problema central da pergunta.",
        "technicalPrecision": "Aprofunde detalhes tecnicos e use exemplos concretos.",
        "communication": "Mantenha ritmo e assertividade na comunicacao.",
    }
    items = [mapping[k] for k, _ in sorted_dims[:2]]

    missing_stacks = [s for s in (config.stacks or []) if s.lower() not in transcript.lower()]
    if missing_stacks:
        items.append(f"Inclua exemplos praticos envolvendo {missing_stacks[0]}.")
    return items if items else ["Inclua mais detalhes tecnicos e exemplos."]


def finalize_evaluation(payload: dict, config: InterviewConfig, question: str) -> dict:
    if not isinstance(payload, dict):
        payload = {}

    legacy_scores_provided = bool(payload.get("_legacyScoresProvided"))
    criteria_scores_provided = bool(payload.get("_criteriaScoresProvided"))
    transcript = (payload.get("transcript") or "").strip()
    heuristic_legacy_scores, heuristic_criteria_scores = _heuristic_scores(transcript, config, question)

    raw_legacy_scores = _extract_legacy_scores(payload)
    has_legacy_values = any(value is not None for value in raw_legacy_scores.values())
    if legacy_scores_provided and has_legacy_values:
        ai_legacy_scores = {
            key: _clamp_score(raw_legacy_scores.get(key))
            if raw_legacy_scores.get(key) is not None
            else heuristic_legacy_scores.get(key, 0)
            for key in _DIMENSIONS
        }
    else:
        ai_legacy_scores = heuristic_legacy_scores.copy()

    derived_criteria_from_legacy = _legacy_to_criteria(ai_legacy_scores)
    raw_criteria_scores = _extract_criteria_scores(payload)
    has_criteria_values = any(value is not None for value in raw_criteria_scores.values())
    if criteria_scores_provided and has_criteria_values:
        ai_criteria_scores = {
            key: _clamp_score(raw_criteria_scores.get(key))
            if raw_criteria_scores.get(key) is not None
            else derived_criteria_from_legacy.get(key, 0)
            for key in _CRITERIA
        }
    else:
        ai_criteria_scores = derived_criteria_from_legacy.copy()
        if has_criteria_values:
            ai_criteria_scores = {
                key: _clamp_score(raw_criteria_scores.get(key))
                if raw_criteria_scores.get(key) is not None
                else ai_criteria_scores.get(key, 0)
                for key in _CRITERIA
            }

    if not legacy_scores_provided and has_criteria_values:
        ai_legacy_scores = _criteria_to_legacy(ai_criteria_scores)

    # Keep default behavior stable with optional calibration.
    blend = 0.0
    if (os.environ.get("EVAL_CALIBRATE_SCORES", "false").strip().lower() in {"1", "true", "yes", "on"}):
        try:
            blend = float(os.environ.get("EVAL_SCORE_BLEND", "0.25"))
        except Exception:
            blend = 0.25
        blend = max(0.0, min(0.5, blend))

    final_criteria_scores = _blend_scores(ai_criteria_scores, heuristic_criteria_scores, blend, _CRITERIA)
    final_scores = _blend_scores(ai_legacy_scores, heuristic_legacy_scores, blend, _DIMENSIONS)

    payload["criteriaScores"] = final_criteria_scores
    payload["scores"] = final_scores

    strengths = payload.get("strengths") if isinstance(payload.get("strengths"), list) else []
    improvements = payload.get("improvements") if isinstance(payload.get("improvements"), list) else []
    strengths = [s for s in strengths if isinstance(s, str) and s.strip()]
    improvements = [s for s in improvements if isinstance(s, str) and s.strip()]

    if not strengths:
        strengths = _default_strengths(final_criteria_scores)
    if not improvements:
        improvements = _default_improvements(final_criteria_scores, config, transcript)

    explicit_follow_up = payload.get("followUpNeeded") if isinstance(payload.get("followUpNeeded"), bool) else None
    if explicit_follow_up is not None:
        follow_up_needed = explicit_follow_up
    else:
        too_short = len(_extract_words(transcript)) < 20
        low_tech = final_criteria_scores.get("technicalPrecision", 0) < 5
        low_relevance = final_criteria_scores.get("relevance", 0) < 5
        low_structure = final_criteria_scores.get("structure", 0) < 5
        follow_up_needed = bool(too_short or low_tech or low_relevance or low_structure)

    follow_up_question = payload.get("followUpQuestion")
    if follow_up_needed and (not isinstance(follow_up_question, str) or not follow_up_question.strip()):
        stack_hint = (config.stacks or [None])[0]
        if stack_hint:
            follow_up_question = f"Pode detalhar uma situacao real em que voce aplicou {stack_hint}?"
        else:
            follow_up_question = "Pode aprofundar os trade-offs tecnicos dessa decisao?"

    payload["transcript"] = transcript
    payload["strengths"] = strengths[:5]
    payload["improvements"] = improvements[:5]
    payload["followUpNeeded"] = follow_up_needed
    payload["followUpQuestion"] = follow_up_question if follow_up_needed else None
    payload.pop("_legacyScoresProvided", None)
    payload.pop("_criteriaScoresProvided", None)
    return payload


def evaluate_audio(payload, user):
    # Lazy import avoids circular dependency: interview_core imports this module.
    from . import interview_core

    interview_core._ensure_credits(user["uid"], required=1)

    audio_bytes = interview_core._b64_to_bytes(payload.audioBase64)
    transcript_fallback = None
    prompt = interview_core._build_eval_prompt(
        payload.config,
        payload.question,
        payload.confirmedName or "o candidato",
        auth_token=user.get("token"),
    )

    try:
        result = interview_core.ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=400,
            temperature=0.2,
            response_mime_type="application/json",
            media=[{"data": audio_bytes, "mime_type": payload.mimeType}],
        )
    except AIProviderError as e:
        try:
            transcript_fallback = interview_core._openai_transcribe_audio(audio_bytes, payload.mimeType)
            prompt_txt = interview_core._build_eval_prompt(
                payload.config,
                payload.question,
                payload.confirmedName or "o candidato",
                transcript=transcript_fallback,
                auth_token=user.get("token"),
            )
            result = interview_core.ai_router.generate(
                task_name="evaluate",
                prompt=prompt_txt,
                max_tokens=400,
                temperature=0.2,
                response_mime_type="application/json",
            )
        except Exception:
            interview_core._handle_ai_error(e)

    try:
        data = interview_core._safe_json_loads(result.output_text or "{}")
        data = interview_core._normalize_eval_payload(data, transcript_fallback=transcript_fallback)
        data = finalize_evaluation(data, payload.config, payload.question)
        evaluation = AnswerEvaluation(**data)
    except Exception:
        try:
            interview_core.logger.warning(
                "Invalid AI evaluation payload (provider=%s model=%s)",
                result.provider_used,
                result.model_used,
            )
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    interview_core._debit_credits(user["uid"], amount=1)
    return evaluation


def evaluate_text(payload, user):
    # Lazy import avoids circular dependency: interview_core imports this module.
    from . import interview_core

    interview_core._ensure_credits(user["uid"], required=1)

    transcript = (payload.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript is required")

    prompt = interview_core._build_eval_prompt(
        payload.config,
        payload.question,
        payload.confirmedName or "o candidato",
        transcript=transcript,
        auth_token=user.get("token"),
    )

    try:
        result = interview_core.ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=400,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        interview_core._handle_ai_error(e)

    try:
        data = interview_core._safe_json_loads(result.output_text or "{}")
        data = interview_core._normalize_eval_payload(data, transcript_fallback=transcript)
        data = finalize_evaluation(data, payload.config, payload.question)
        evaluation = AnswerEvaluation(**data)
    except Exception:
        try:
            interview_core.logger.warning(
                "Invalid AI text-evaluation payload (provider=%s model=%s)",
                result.provider_used,
                result.model_used,
            )
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    interview_core._debit_credits(user["uid"], amount=1)
    return evaluation
