import os
import json
import logging
import base64
import re
import urllib.request
import urllib.error
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from dotenv import load_dotenv

from ..firebase_admin import get_current_user
from ..ai.prompts import evaluate_prompt, next_question_prompt, plan_prompt, report_prompt
from ..ai.router import AIRouter, AIProviderError
from ..mcp_client import get_rubric as mcp_get_rubric, get_recent_interviews as mcp_get_recent_interviews
from ..repositories import session_repository, user_repository
from ..services import evaluation_service, usage_policy_service
from .. import tts as tts_module
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

router = APIRouter()
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


@router.get("/health")
def health():
    return {"ok": True, "time": now_iso()}

@router.get("/me", response_model=UserProfile)
def me(user=Depends(get_current_user)):
    logger.info("GET /me called uid=%s email=%s", user.get("uid"), user.get("email"))
    try:
        data = user_repository.get_user(user["uid"])
        if not data:
            profile = {
                "uid": user["uid"],
                "name": user.get("name") or user.get("email", "Usuario").split("@")[0],
                "displayName": user.get("displayName") or user.get("name") or user.get("email", "Usuario").split("@")[0],
                "email": user.get("email", ""),
                "avatar": user.get("picture"),
                "photoURL": user.get("photoURL") or user.get("picture"),
                "plan": os.environ.get("DEFAULT_PLAN", "free"),
                "credits": _initial_credits(),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }
            user_repository.upsert_user(user["uid"], profile, merge=True)
            return UserProfile(**profile)

        data.setdefault("uid", user["uid"])
        try:
            data["interviews"] = user_repository.list_user_interviews(user["uid"], limit=20)
        except Exception:
            data.setdefault("interviews", [])
        return UserProfile(**data)
    except Exception:
        logger.exception("GET /me failed; returning fallback profile")
        return UserProfile(
            uid=user["uid"],
            name=user.get("name") or user.get("email", "Usuario").split("@")[0],
            email=user.get("email", ""),
            avatar=user.get("picture"),
            credits=_initial_credits(),
            interviews=[],
        )


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


@router.post("/sessions/start", response_model=SessionStartResponse)
def start_session(config: InterviewConfig, user=Depends(get_current_user)):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.start_session(config, user)


@router.post("/sessions/{session_id}/plan/generate", response_model=PlanGenerateResponse)
def generate_plan(session_id: str, user=Depends(get_current_user)):
    data = session_repository.get_session(session_id)
    if not data or data.get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    if data.get("plan"):
        plan = InterviewPlan(**data.get("plan"))
        return PlanGenerateResponse(
            sessionId=session_id,
            plan=plan,
            plan_status=data.get("plan_status", "completed"),
            provider_used=data.get("provider_used", "unknown"),
            model_used=data.get("model_used", "unknown"),
            latency_ms=int(data.get("latency_ms", 0) or 0),
            tokens_used=data.get("tokens_used"),
            credits=_get_user_credits(user["uid"]),
        )

    _ensure_credits(user["uid"], required=1)

    config = InterviewConfig(**data.get("config"))
    plan_context = _build_plan_context(user.get("uid"), config, auth_token=user.get("token"))
    prompt = _build_plan_prompt(config, plan_context)

    try:
        result = ai_router.generate(
            task_name="plan",
            prompt=prompt,
            max_tokens=800,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        _handle_ai_error(e)

    try:
        payload = _safe_json_loads(result.output_text or "{}")
        plan = _parse_plan_payload(payload, config)
        if not plan:
            raise ValueError("Invalid plan payload")
    except Exception:
        logger.warning("Invalid plan payload from AI (provider=%s model=%s)", result.provider_used, result.model_used)
        # Retry once with stricter prompt
        try:
            retry_result = ai_router.generate(
                task_name="plan",
                prompt=_build_plan_prompt_strict(config, plan_context),
                max_tokens=900,
                temperature=0.1,
                response_mime_type="application/json",
            )
            retry_payload = _safe_json_loads(retry_result.output_text or "{}")
            plan = _parse_plan_payload(retry_payload, config)
            if not plan:
                raise ValueError("Invalid plan payload after retry")
            result = retry_result
        except AIProviderError as e:
            _handle_ai_error(e)
        except Exception:
            raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    new_credits = _debit_credits(user["uid"], amount=1)

    session_repository.upsert_session(
        session_id,
        {
            "plan": plan.model_dump(),
            "plan_status": "completed",
            "provider_used": result.provider_used,
            "model_used": result.model_used,
            "latency_ms": result.latency_ms,
            "tokens_used": result.tokens_used,
            "updatedAt": now_iso(),
        },
        merge=True,
    )

    return PlanGenerateResponse(
        sessionId=session_id,
        plan=plan,
        plan_status="completed",
        provider_used=result.provider_used,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        tokens_used=result.tokens_used,
        credits=new_credits,
    )


@router.post("/ai/name-extract")
def name_extract(payload: NameExtractRequest, user=Depends(get_current_user)):
    cost = _credit_cost("CREDITS_NAME_EXTRACT", 1)
    if cost > 0:
        _ensure_credits(user["uid"], required=cost)

    audio_bytes = _b64_to_bytes(payload.audioBase64)
    prompt = f"Extraia apenas o primeiro nome da pessoa do audio. Responda somente o nome (1 palavra). Idioma: {payload.uiLanguage}"
    try:
        result = ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=20,
            temperature=0.0,
            media=[{"data": audio_bytes, "mime_type": payload.mimeType}],
        )
    except AIProviderError as e:
        # Fallback: transcribe with OpenAI and extract name from text
        try:
            transcript = _openai_transcribe_audio(audio_bytes, payload.mimeType)
            prompt_txt = (
                f"Transcrição: {transcript}\n"
                f"Extraia apenas o primeiro nome da pessoa. Responda somente o nome (1 palavra). Idioma: {payload.uiLanguage}"
            )
            result = ai_router.generate(
                task_name="evaluate",
                prompt=prompt_txt,
                max_tokens=20,
                temperature=0.0,
            )
        except Exception:
            _handle_ai_error(e)

    name = (result.output_text or "").strip().split()
    if cost > 0:
        _debit_credits(user["uid"], amount=cost)
    return {"name": name[0] if name else "Candidato"}


@router.post("/ai/plan", response_model=SessionStartResponse)
def api_ai_plan(config: InterviewConfig, user=Depends(get_current_user)):
    return start_session(config, user)


@router.post("/ai/evaluate", response_model=AnswerEvaluation)
def api_ai_evaluate(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return evaluate_audio(payload, user)


@router.post("/ai/report", response_model=FinalReport)
def api_ai_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return final_report(payload, user)


@router.post("/ai/next-question", response_model=NextQuestionResponse)
def next_question(payload: NextQuestionRequest, user=Depends(get_current_user)):
    config = payload.config
    history = payload.history or []
    remaining_seconds = int(payload.remainingSeconds or 0)
    asked_count = len(history)

    duration = _clamp_duration_minutes(config)
    min_q, max_q = _plan_question_bounds(duration)

    if remaining_seconds <= 60 or asked_count >= max_q:
        return NextQuestionResponse(shouldFinish=True, reason="time_or_max")

    context = _build_plan_context(user.get("uid"), config, auth_token=user.get("token"))
    prompt = _build_next_question_prompt(
        config=config,
        history=history,
        remaining_seconds=remaining_seconds,
        asked_count=asked_count,
        min_q=min_q,
        max_q=max_q,
        difficulty_level=payload.difficultyLevel,
        context=context,
    )

    try:
        result = ai_router.generate(
            task_name="plan",
            prompt=prompt,
            max_tokens=320,
            temperature=0.4,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        _handle_ai_error(e)

    try:
        data = _safe_json_loads(result.output_text or "{}")
        question, should_finish, reason = _parse_next_question_payload(data, asked_count)
        if should_finish and asked_count >= min_q:
            return NextQuestionResponse(
                shouldFinish=True,
                reason=reason,
                provider_used=result.provider_used,
                model_used=result.model_used,
                latency_ms=result.latency_ms,
                tokens_used=result.tokens_used,
            )
        if not question:
            raise ValueError("Invalid next question payload")
    except Exception:
        logger.warning("Invalid next-question payload (provider=%s model=%s)", result.provider_used, result.model_used)
        try:
            retry_result = ai_router.generate(
                task_name="plan",
                prompt=_build_next_question_prompt_strict(
                    config=config,
                    history=history,
                    remaining_seconds=remaining_seconds,
                    asked_count=asked_count,
                    min_q=min_q,
                    max_q=max_q,
                    difficulty_level=payload.difficultyLevel,
                    context=context,
                ),
                max_tokens=360,
                temperature=0.2,
                response_mime_type="application/json",
            )
            retry_data = _safe_json_loads(retry_result.output_text or "{}")
            question, should_finish, reason = _parse_next_question_payload(retry_data, asked_count)
            if should_finish and asked_count >= min_q:
                return NextQuestionResponse(
                    shouldFinish=True,
                    reason=reason,
                    provider_used=retry_result.provider_used,
                    model_used=retry_result.model_used,
                    latency_ms=retry_result.latency_ms,
                    tokens_used=retry_result.tokens_used,
                )
            if not question:
                raise ValueError("Invalid next question payload after retry")
            result = retry_result
        except AIProviderError as e:
            _handle_ai_error(e)
        except Exception:
            raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    return NextQuestionResponse(
        shouldFinish=False,
        reason=None,
        question=question,
        provider_used=result.provider_used,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        tokens_used=result.tokens_used,
    )


@router.post("/ai/tts")
def api_tts(body: dict, user=Depends(get_current_user)):
    text = body.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
    cost = _credit_cost("CREDITS_TTS", 1)
    if cost > 0:
        _ensure_credits(user["uid"], required=cost)
    language = body.get("language", "pt-BR")
    voice = body.get("voice")
    try:
        audio = tts_module.synthesize_text(text=text, language_code=language, voice_name=voice)
        b64 = base64.b64encode(audio).decode()
        fmt = (os.environ.get("OPENAI_TTS_FORMAT") or "mp3").lower().strip()
        if fmt in ("wav", "wave"):
            mime = "audio/wav"
        elif fmt in ("ogg", "opus"):
            mime = "audio/ogg"
        else:
            mime = "audio/mpeg"
        if cost > 0:
            _debit_credits(user["uid"], amount=cost)
        return {"audioBase64": b64, "mimeType": mime}
    except Exception:
        logger.exception("TTS synth failed")
        raise HTTPException(status_code=503, detail="TTS service unavailable")


@router.post("/ai/evaluate-audio", response_model=AnswerEvaluation)
def evaluate_audio(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    _ensure_credits(user["uid"], required=1)

    audio_bytes = _b64_to_bytes(payload.audioBase64)
    transcript_fallback = None
    prompt = _build_eval_prompt(
        payload.config,
        payload.question,
        payload.confirmedName or "o candidato",
        auth_token=user.get("token"),
    )

    try:
        result = ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=400,
            temperature=0.2,
            response_mime_type="application/json",
            media=[{"data": audio_bytes, "mime_type": payload.mimeType}],
        )
    except AIProviderError as e:
        # Fallback: transcribe with OpenAI and evaluate from text
        try:
            transcript_fallback = _openai_transcribe_audio(audio_bytes, payload.mimeType)
            prompt_txt = _build_eval_prompt(
                payload.config,
                payload.question,
                payload.confirmedName or "o candidato",
                transcript=transcript_fallback,
                auth_token=user.get("token"),
            )
            result = ai_router.generate(
                task_name="evaluate",
                prompt=prompt_txt,
                max_tokens=400,
                temperature=0.2,
                response_mime_type="application/json",
            )
        except Exception:
            _handle_ai_error(e)

    try:
        data = _safe_json_loads(result.output_text or "{}")
        data = _normalize_eval_payload(data, transcript_fallback=transcript_fallback)
        data = evaluation_service.finalize_evaluation(data, payload.config, payload.question)
        evaluation = AnswerEvaluation(**data)
    except Exception:
        try:
            logger.warning("Invalid AI evaluation payload (provider=%s model=%s)", result.provider_used, result.model_used)
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    _debit_credits(user["uid"], amount=1)
    return evaluation


def evaluate_text(payload: EvaluateTextRequest, user=Depends(get_current_user)):
    _ensure_credits(user["uid"], required=1)

    transcript = (payload.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript is required")

    prompt = _build_eval_prompt(
        payload.config,
        payload.question,
        payload.confirmedName or "o candidato",
        transcript=transcript,
        auth_token=user.get("token"),
    )

    try:
        result = ai_router.generate(
            task_name="evaluate",
            prompt=prompt,
            max_tokens=400,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        _handle_ai_error(e)

    try:
        data = _safe_json_loads(result.output_text or "{}")
        data = _normalize_eval_payload(data, transcript_fallback=transcript)
        data = evaluation_service.finalize_evaluation(data, payload.config, payload.question)
        evaluation = AnswerEvaluation(**data)
    except Exception:
        try:
            logger.warning("Invalid AI text-evaluation payload (provider=%s model=%s)", result.provider_used, result.model_used)
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    _debit_credits(user["uid"], amount=1)
    return evaluation


@router.post("/ai/final-report", response_model=FinalReport)
def final_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    _ensure_credits(user["uid"], required=1)

    report_context = _build_report_context(user.get("uid"), payload.config, auth_token=user.get("token"))
    prompt = _build_report_prompt(payload.config, payload.history, report_context)
    summary = _summarize_scores(payload.history)
    try:
        result = ai_router.generate(
            task_name="report",
            prompt=prompt,
            max_tokens=1200,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        _handle_ai_error(e)

    try:
        data = _safe_json_loads(result.output_text or "{}")
        report = FinalReport(**data)
        if summary:
            scores_summary, criteria_summary, overall = summary
            report_data = report.model_dump()
            report_data["scoresSummary"] = scores_summary.model_dump()
            if criteria_summary:
                report_data["criteriaSummary"] = criteria_summary.model_dump()
            report_data["overallScore"] = overall
            report = FinalReport(**report_data)
    except Exception:
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    _debit_credits(user["uid"], amount=1)
    return report


@router.post("/sessions/{session_id}/finish")
def finish_session(session_id: str, payload: SessionFinishRequest, user=Depends(get_current_user)):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.finish_session(session_id, payload, user)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)):
    # Legacy compatibility path. Official session lifecycle lives in session_service.
    from . import session_service

    return session_service.delete_session(session_id, user)


@router.post("/credits/dev-add")
def dev_add_credits(amount: int = 3, user=Depends(get_current_user)):
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

