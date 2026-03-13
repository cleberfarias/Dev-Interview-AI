import os
import json
import logging
import base64
import re
import urllib.request
import urllib.error
from typing import Optional
from datetime import datetime, timezone

from fastapi import HTTPException
from dotenv import load_dotenv

from ..ai.prompts import evaluate_prompt, next_question_prompt, plan_prompt, report_prompt
from ..ai.router import AIRouter, AIProviderError
from ..mcp_client import get_rubric as mcp_get_rubric, get_recent_interviews as mcp_get_recent_interviews
from ..services import evaluation_service, usage_policy_service
from ..schemas import (
    InterviewConfig,
    InterviewPlan,
    InterviewQuestion,
    AnswerEvaluation,
    AnswerCriteriaScores,
    AnswerScores,
    FinalReport,
    UserProfile,
    SessionStartResponse,
    PlanGenerateResponse,
    NameExtractRequest,
    EvaluateAudioRequest,
    EvaluateTextRequest,
    FinalReportRequest,
    NextQuestionRequest,
    NextQuestionResponse,
    SessionFinishRequest,
)

# Load backend/.env when present (local dev)
_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
load_dotenv(_env_path)

logger = logging.getLogger('uvicorn.error')
ai_router = AIRouter()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)

def _credit_cost(name: str, default: int) -> int:
    return usage_policy_service.credit_cost(name, default)

def _initial_credits() -> int:
    return _env_int("FREE_TRIAL_CREDITS", _env_int("DEFAULT_CREDITS", 3))

def _max_minutes_for_plan(plan: Optional[str]) -> int:
    plan_value = (plan or "free").lower()
    free_max = _env_int("INTERVIEW_MAX_MINUTES_FREE", 15)
    pro_max = _env_int("INTERVIEW_MAX_MINUTES_PRO", 25)
    return pro_max if plan_value == "pro" else free_max

def _clamp_duration_minutes(config: InterviewConfig) -> int:
    min_minutes = _env_int("INTERVIEW_MIN_MINUTES", 10)
    max_minutes = _max_minutes_for_plan(config.plan)
    try:
        duration = int(config.duration)
    except Exception:
        duration = max_minutes
    return max(min_minutes, min(duration, max_minutes))

def _normalize_config(config: InterviewConfig) -> InterviewConfig:
    duration = _clamp_duration_minutes(config)
    if duration == config.duration:
        return config
    data = config.model_dump()
    data["duration"] = duration
    return InterviewConfig(**data)

def _plan_question_bounds(duration_min: int) -> tuple[int, int]:
    avg = max(6, min(12, round(duration_min / 2)))
    min_q = max(6, avg - 1)
    max_q = min(14, avg + 1)
    return min_q, max_q

def _mcp_context_enabled() -> bool:
    raw = (os.environ.get("MCP_CONTEXT_ENABLED") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}

def _build_rubric_block(config: InterviewConfig, question: str, auth_token: Optional[str] = None) -> str:
    if not _mcp_context_enabled():
        return ""
    try:
        rubric = mcp_get_rubric(
            track=config.track,
            seniority=config.seniority,
            stacks=config.stacks,
            question=question,
            auth_token=auth_token,
        )
    except Exception:
        logger.exception("Failed to build rubric context")
        return ""

    if not rubric:
        return ""

    focus = ", ".join(rubric.get("focus") or [])
    good = ", ".join(rubric.get("good_signals") or [])
    bad = ", ".join(rubric.get("red_flags") or [])
    if not (focus or good or bad):
        return ""

    return f"""
Rubrica de avaliacao (use como referencia):
- Foco: {focus}
- Bons sinais: {good}
- Red flags: {bad}
"""

def _rubric_summary(config: InterviewConfig, auth_token: Optional[str] = None) -> Optional[dict]:
    try:
        rubric = mcp_get_rubric(
            track=config.track,
            seniority=config.seniority,
            stacks=config.stacks,
            question=None,
            auth_token=auth_token,
        )
    except Exception:
        return None
    if not rubric:
        return None
    return {
        "focus": rubric.get("focus") or [],
        "good_signals": rubric.get("good_signals") or [],
        "red_flags": rubric.get("red_flags") or [],
    }

def _build_plan_context(user_uid: str, config: InterviewConfig, auth_token: Optional[str] = None) -> str:
    if not _mcp_context_enabled():
        return ""
    if not user_uid:
        return ""
    ctx = {}
    recent = mcp_get_recent_interviews(user_uid, limit=3, auth_token=auth_token)
    if recent:
        ctx["recent_interviews"] = recent
    rubric = _rubric_summary(config, auth_token=auth_token)
    if rubric:
        ctx["rubric"] = rubric
    if not ctx:
        return ""
    try:
        blob = json.dumps(ctx, ensure_ascii=True)
    except Exception:
        return ""
    return f"\nContexto adicional (nao inventar, use apenas se ajudar):\n{blob}\n"

def _build_report_context(user_uid: str, config: InterviewConfig, auth_token: Optional[str] = None) -> str:
    if not _mcp_context_enabled():
        return ""
    if not user_uid:
        return ""
    ctx = {}
    recent = mcp_get_recent_interviews(user_uid, limit=5, auth_token=auth_token)
    if recent:
        ctx["recent_interviews"] = recent
    rubric = _rubric_summary(config, auth_token=auth_token)
    if rubric:
        ctx["rubric"] = rubric
    if not ctx:
        return ""
    try:
        blob = json.dumps(ctx, ensure_ascii=True)
    except Exception:
        return ""
    return f"\nContexto adicional (nao inventar, use apenas se ajudar):\n{blob}\n"


def health():
    from . import profile_service

    return profile_service.health()

def me(user):
    from . import profile_service

    return profile_service.me(user)


def _get_user_credits(user_uid: str) -> int:
    return usage_policy_service.get_user_credits(user_uid)


def _ensure_credits(user_uid: str, required: int = 1) -> int:
    required_safe = max(0, int(required))
    credits = _get_user_credits(user_uid)
    if credits < required_safe:
        raise HTTPException(status_code=402, detail="Creditos insuficientes")
    return credits


def _debit_credits(user_uid: str, amount: int = 1) -> int:
    return usage_policy_service.debit_credits(user_uid, amount=amount)


def _handle_ai_error(e: AIProviderError):
    # Log detailed provider error for easier debugging (which provider/model/retry info)
    try:
        logger.error("AI provider error: %s | status=%s retry_after=%s retryable=%s", str(e), getattr(e, 'status_code', None), getattr(e, 'retry_after', None), getattr(e, 'retryable', None))
    except Exception:
        logger.exception("Failed logging AIProviderError")
    headers = {}
    if e.retry_after:
        headers["Retry-After"] = str(e.retry_after)
    # Surface a generic message to the client but keep logs for operators
    raise HTTPException(status_code=e.status_code or 503, detail="AI indisponivel. Tente novamente.", headers=headers)

def _safe_json_loads(text: str):
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            snippet = cleaned[start : end + 1]
            return json.loads(snippet)
        raise

def _openai_transcribe_audio(audio_bytes: bytes, mime_type: str) -> str:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY nao configurada")

    model = (os.environ.get("OPENAI_TRANSCRIBE_MODEL") or "gpt-4o-mini-transcribe").strip()
    boundary = f"----codexboundary{uuid.uuid4().hex}"

    def _part(name: str, value: str) -> bytes:
        return (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")

    filename = "audio.webm"
    file_header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8")
    file_footer = b"\r\n"

    body = b"".join([
        _part("model", model),
        file_header,
        audio_bytes,
        file_footer,
        f"--{boundary}--\r\n".encode("utf-8"),
    ])

    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI transcribe error: {e.code} {body}") from e

    try:
        data = json.loads(raw)
        return (data.get("text") or "").strip()
    except Exception:
        return raw.strip()

def _build_plan_prompt_strict(config: InterviewConfig, context: str = "") -> str:
    duration = _clamp_duration_minutes(config)
    min_q, max_q = _plan_question_bounds(duration)
    return plan_prompt.build_plan_prompt_strict(
        config=config,
        duration_minutes=duration,
        min_questions=min_q,
        max_questions=max_q,
        context=context,
    )

def _parse_plan_payload(payload: dict, config: InterviewConfig) -> Optional[InterviewPlan]:
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("plan"), dict):
        payload = payload.get("plan") or payload

    questions_raw = payload.get("questions")
    if not isinstance(questions_raw, list):
        return None

    questions = []
    for i, q in enumerate(questions_raw):
        if isinstance(q, dict):
            prompt = q.get("prompt") or q.get("question") or q.get("text")
            if not prompt:
                continue
            questions.append(
                InterviewQuestion(
                    id=str(q.get("id") or f"q{i+1}"),
                    section=str(q.get("section") or "technical"),
                    difficulty=float(q.get("difficulty") or 3),
                    prompt=str(prompt),
                )
            )
        elif isinstance(q, str):
            questions.append(
                InterviewQuestion(
                    id=f"q{i+1}",
                    section="technical",
                    difficulty=3,
                    prompt=q,
                )
            )

    if len(questions) < 5:
        return None

    role_title = payload.get("roleTitleGuess") or payload.get("role") or config.track or "Entrevista"
    seniority = payload.get("seniorityGuess") or config.seniority
    must_have = payload.get("mustHaveSkills") or config.stacks or []
    blueprint = payload.get("blueprint") or {"hr": 15, "technical": 50, "design": 20, "behavioral": 15}

    return InterviewPlan(
        roleTitleGuess=role_title,
        seniorityGuess=seniority,
        mustHaveSkills=must_have,
        blueprint=blueprint,
        questions=questions,
    )

def _build_plan_prompt(config: InterviewConfig, context: str = "") -> str:
    duration = _clamp_duration_minutes(config)
    min_q, max_q = _plan_question_bounds(duration)
    return plan_prompt.build_plan_prompt(
        config=config,
        duration_minutes=duration,
        min_questions=min_q,
        max_questions=max_q,
        context=context,
    )


def _build_eval_prompt(config: InterviewConfig, question: str, confirmed_name: str, transcript: Optional[str] = None, auth_token: Optional[str] = None) -> str:
    rubric_block = _build_rubric_block(config, question, auth_token=auth_token)
    return evaluate_prompt.build_eval_prompt(
        config=config,
        question=question,
        candidate_name=confirmed_name,
        rubric_block=rubric_block,
        transcript=transcript,
    )


def _difficulty_range_from_level(level: Optional[int]) -> Optional[tuple[int, int]]:
    if not level:
        return None
    try:
        lvl = int(level)
    except Exception:
        return None
    if lvl <= 1:
        return (1, 2)
    if lvl == 2:
        return (3, 4)
    return (4, 5)


def _summarize_history_for_next(history: list, limit: int = 4) -> list:
    if not isinstance(history, list):
        return []
    items = []
    for item in history[-limit:]:
        if not isinstance(item, dict):
            continue
        evaluation = item.get("evaluation") or item.get("answerEvaluation") or item.get("eval") or {}
        scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else evaluation
        items.append(
            {
                "question": item.get("question"),
                "section": item.get("section"),
                "difficulty": item.get("difficulty"),
                "scores": scores if isinstance(scores, dict) else {},
                "strengths": evaluation.get("strengths", []),
                "improvements": evaluation.get("improvements", []),
                "followUpNeeded": evaluation.get("followUpNeeded", False),
                "followUpQuestion": evaluation.get("followUpQuestion"),
            }
        )
    return items


def _build_next_question_prompt(
    config: InterviewConfig,
    history: list,
    remaining_seconds: int,
    asked_count: int,
    min_q: int,
    max_q: int,
    difficulty_level: Optional[int] = None,
    context: str = "",
) -> str:
    history_summary = _summarize_history_for_next(history)
    score_summary = _summarize_scores(history)
    avg_scores = score_summary[0].model_dump() if score_summary else {}
    diff_range = _difficulty_range_from_level(difficulty_level)
    diff_hint = f"{diff_range[0]}-{diff_range[1]}" if diff_range else "1-5"
    return next_question_prompt.build_next_question_prompt(
        config=config,
        history_summary=history_summary,
        average_scores=avg_scores,
        remaining_seconds=remaining_seconds,
        asked_count=asked_count,
        min_questions=min_q,
        max_questions=max_q,
        difficulty_hint=diff_hint,
        context=context,
    )


def _build_next_question_prompt_strict(
    config: InterviewConfig,
    history: list,
    remaining_seconds: int,
    asked_count: int,
    min_q: int,
    max_q: int,
    difficulty_level: Optional[int] = None,
    context: str = "",
) -> str:
    history_summary = _summarize_history_for_next(history)
    score_summary = _summarize_scores(history)
    avg_scores = score_summary[0].model_dump() if score_summary else {}
    diff_range = _difficulty_range_from_level(difficulty_level)
    diff_hint = f"{diff_range[0]}-{diff_range[1]}" if diff_range else "1-5"
    return next_question_prompt.build_next_question_prompt_strict(
        config=config,
        history_summary=history_summary,
        average_scores=avg_scores,
        remaining_seconds=remaining_seconds,
        asked_count=asked_count,
        min_questions=min_q,
        max_questions=max_q,
        difficulty_hint=diff_hint,
        context=context,
    )


def _parse_next_question_payload(payload: dict, asked_count: int) -> tuple[Optional[InterviewQuestion], bool, Optional[str]]:
    if not isinstance(payload, dict):
        return None, True, "invalid_payload"

    should_finish = bool(payload.get("shouldFinish") or payload.get("finish") or payload.get("done"))
    reason = payload.get("reason")
    if should_finish:
        return None, True, reason

    q = payload.get("question") if isinstance(payload.get("question"), dict) else payload
    if not isinstance(q, dict):
        return None, True, "missing_question"

    prompt = q.get("prompt") or q.get("question") or q.get("text")
    if not prompt:
        return None, True, "missing_prompt"

    try:
        difficulty = float(q.get("difficulty") or 3)
    except Exception:
        difficulty = 3

    section = str(q.get("section") or "technical").lower()
    if section not in {"hr", "technical", "design", "behavioral"}:
        section = "technical"

    qid = str(q.get("id") or f"q{asked_count + 1}")

    return (
        InterviewQuestion(
            id=qid,
            section=section,
            difficulty=difficulty,
            prompt=str(prompt),
        ),
        False,
        reason,
    )

def _normalize_eval_payload(payload: dict, transcript_fallback: Optional[str] = None) -> dict:
    if not isinstance(payload, dict):
        return {}

    # Normalize scores (accept alternate shapes/keys)
    scores_raw = payload.get("scores")
    explicit_legacy_scores = False
    if isinstance(scores_raw, dict):
        explicit_legacy_scores = any(
            key in scores_raw
            for key in ("communication", "technical", "problemSolving", "problem_solving", "presence")
        )
    if not explicit_legacy_scores:
        explicit_legacy_scores = any(
            key in payload
            for key in ("communication", "technical", "problemSolving", "problem_solving", "presence")
        )

    scores = scores_raw
    if not isinstance(scores, dict):
        scores = {}
        for key in ("communication", "technical", "problemSolving", "presence"):
            if key in payload:
                scores[key] = payload.get(key)

    if "problemSolving" not in scores:
        for alt in ("problem_solving", "problem_solving_score", "problemSolvingScore", "problem solving"):
            if alt in scores:
                scores["problemSolving"] = scores.get(alt)
                break
        if "problemSolving" not in scores and "problem_solving" in payload:
            scores["problemSolving"] = payload.get("problem_solving")

    scores.setdefault("communication", 0)
    scores.setdefault("technical", 0)
    scores.setdefault("problemSolving", 0)
    scores.setdefault("presence", 0)
    payload["scores"] = scores
    payload["_legacyScoresProvided"] = explicit_legacy_scores

    # Normalize optional criteria scores
    criteria_raw = payload.get("criteriaScores")
    explicit_criteria_scores = False
    if isinstance(criteria_raw, dict):
        explicit_criteria_scores = any(
            key in criteria_raw
            for key in (
                "clarity",
                "structure",
                "relevance",
                "technicalPrecision",
                "technical_precision",
                "communication",
                "clareza",
                "estrutura",
                "relevancia",
                "relevância",
            )
        )
    if not explicit_criteria_scores:
        criteria_alt_raw = payload.get("criteria")
        if isinstance(criteria_alt_raw, dict):
            explicit_criteria_scores = True
    if not explicit_criteria_scores:
        explicit_criteria_scores = any(
            key in payload
            for key in (
                "clarity",
                "structure",
                "relevance",
                "technicalPrecision",
                "technical_precision",
                "clarity",
                "clareza",
                "estrutura",
                "relevancia",
                "relevância",
            )
        )

    criteria = criteria_raw
    if not isinstance(criteria, dict):
        criteria = payload.get("criteria") if isinstance(payload.get("criteria"), dict) else {}

    criteria_candidates = [criteria, payload, scores]
    criteria_aliases = {
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
    normalized_criteria = {}
    for key, aliases in criteria_aliases.items():
        value = None
        for source in criteria_candidates:
            if not isinstance(source, dict):
                continue
            for alias in aliases:
                if alias in source:
                    value = source.get(alias)
                    break
            if value is not None:
                break
        if value is not None:
            normalized_criteria[key] = value
    if normalized_criteria:
        payload["criteriaScores"] = normalized_criteria
    payload["_criteriaScoresProvided"] = explicit_criteria_scores

    # Transcript normalization
    transcript = (
        payload.get("transcript")
        or payload.get("transcricao")
        or payload.get("transcrição")
        or payload.get("transcription")
    )
    if not transcript and transcript_fallback:
        transcript = transcript_fallback
    payload["transcript"] = transcript or ""

    # Ensure list fields are lists
    for key in ("strengths", "improvements"):
        val = payload.get(key)
        if isinstance(val, str):
            items = [v.strip() for v in re.split(r"[;\n]", val) if v.strip()]
            payload[key] = items
        elif val is None:
            payload[key] = []

    # Normalize follow-up fields
    if "followUpNeeded" not in payload:
        alt = payload.get("followupNeeded") or payload.get("follow_up_needed")
        if isinstance(alt, bool):
            payload["followUpNeeded"] = alt
    if "followUpQuestion" not in payload:
        alt = payload.get("followupQuestion") or payload.get("follow_up_question")
        if alt is not None:
            payload["followUpQuestion"] = alt

    return payload


def _build_report_prompt(config: InterviewConfig, history: list, context: str = "") -> str:
    return report_prompt.build_report_prompt(config=config, history=history, context=context)


def _summarize_scores(history: list) -> Optional[tuple[AnswerScores, Optional[AnswerCriteriaScores], float]]:
    if not isinstance(history, list):
        return None
    sums = {"communication": 0.0, "technical": 0.0, "problemSolving": 0.0, "presence": 0.0}
    counts = {"communication": 0, "technical": 0, "problemSolving": 0, "presence": 0}
    criteria_sums = {
        "clarity": 0.0,
        "structure": 0.0,
        "relevance": 0.0,
        "technicalPrecision": 0.0,
        "communication": 0.0,
    }
    criteria_counts = {
        "clarity": 0,
        "structure": 0,
        "relevance": 0,
        "technicalPrecision": 0,
        "communication": 0,
    }

    for item in history:
        if not isinstance(item, dict):
            continue
        evaluation = item.get("evaluation") or item.get("answerEvaluation") or item.get("eval")
        if not isinstance(evaluation, dict):
            continue
        scores = evaluation.get("scores") if isinstance(evaluation.get("scores"), dict) else evaluation
        if not isinstance(scores, dict):
            continue
        for key in sums.keys():
            val = scores.get(key)
            try:
                val = float(val)
            except Exception:
                continue
            sums[key] += val
            counts[key] += 1

        criteria = evaluation.get("criteriaScores") if isinstance(evaluation.get("criteriaScores"), dict) else {}
        if isinstance(criteria, dict):
            for key in criteria_sums.keys():
                val = criteria.get(key)
                try:
                    val = float(val)
                except Exception:
                    continue
                criteria_sums[key] += val
                criteria_counts[key] += 1

    if not any(counts.values()):
        return None

    avg = {}
    for key in sums.keys():
        if counts[key] > 0:
            avg[key] = round(sums[key] / counts[key], 2)
        else:
            avg[key] = 0.0

    criteria_summary: Optional[AnswerCriteriaScores] = None
    if any(criteria_counts.values()):
        avg_criteria = {}
        for key in criteria_sums.keys():
            if criteria_counts[key] > 0:
                avg_criteria[key] = round(criteria_sums[key] / criteria_counts[key], 2)
            else:
                avg_criteria[key] = 0.0
        criteria_summary = AnswerCriteriaScores(**avg_criteria)
        overall = round(sum(avg_criteria.values()) / len(avg_criteria), 2)
    else:
        overall = round(sum(avg.values()) / len(avg), 2)

    return AnswerScores(**avg), criteria_summary, overall


def start_session(config: InterviewConfig, user):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.start_session(config, user)


def generate_plan(session_id: str, user):
    from . import planning_service

    return planning_service.generate_plan(session_id, user)


def name_extract(payload: NameExtractRequest, user):
    from . import ai_utility_service

    return ai_utility_service.name_extract(payload, user)


def api_ai_plan(config: InterviewConfig, user):
    return start_session(config, user)


def api_ai_evaluate(payload: EvaluateAudioRequest, user):
    return evaluate_audio(payload, user)


def api_ai_report(payload: FinalReportRequest, user):
    return final_report(payload, user)


def next_question(payload: NextQuestionRequest, user):
    from . import planning_service

    return planning_service.next_question(payload, user)


def api_tts(body: dict, user):
    from . import ai_utility_service

    return ai_utility_service.tts(body, user)


def evaluate_audio(payload: EvaluateAudioRequest, user):
    return evaluation_service.evaluate_audio(payload, user)


def evaluate_text(payload: EvaluateTextRequest, user):
    return evaluation_service.evaluate_text(payload, user)


def final_report(payload: FinalReportRequest, user):
    from . import report_service

    return report_service.final_report(payload, user)


def finish_session(session_id: str, payload: SessionFinishRequest, user):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.finish_session(session_id, payload, user)


def delete_session(session_id: str, user):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.delete_session(session_id, user)


def dev_add_credits(amount: int = 3, user=None):
    if not isinstance(user, dict) or not user.get("uid"):
        raise HTTPException(status_code=401, detail="Usuario nao autenticado")
    if os.environ.get("ALLOW_DEV_CREDITS", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Desabilitado")
    if amount <= 0 or amount > 1000:
        raise HTTPException(status_code=400, detail="amount invalido")

    total = usage_policy_service.add_credits(user["uid"], int(amount))
    return {"credits": total}


def _b64_to_bytes(b64: str) -> bytes:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    pad = "=" * (-len(b64) % 4)
    return base64.b64decode(b64 + pad)

