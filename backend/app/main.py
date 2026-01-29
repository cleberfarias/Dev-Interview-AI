import os
import json
import logging
import uuid
import base64
import re
import urllib.request
import urllib.error
from typing import Optional
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from google.cloud import firestore
from dotenv import load_dotenv

from .firebase_admin import get_firestore_client, get_current_user
from .ai.router import AIRouter, AIProviderError
from . import tts as tts_module
from .schemas import (
    InterviewConfig,
    InterviewPlan,
    InterviewQuestion,
    AnswerEvaluation,
    AnswerScores,
    FinalReport,
    UserProfile,
    SessionStartResponse,
    PlanGenerateResponse,
    NameExtractRequest,
    EvaluateAudioRequest,
    FinalReportRequest,
    SessionFinishRequest,
)

# Load backend/.env when present (local dev)
_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(_env_path)

class StripApiPrefixMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            path = scope.get("path", "")
            if path == "/api":
                scope["path"] = "/"
                scope["raw_path"] = b"/"
            elif path.startswith("/api/"):
                new_path = path[len("/api") :]
                scope["path"] = new_path
                scope["raw_path"] = new_path.encode("utf-8")
        await self.app(scope, receive, send)


app = FastAPI(title="Dev Interview AI API", version="1.0.0")
app.add_middleware(StripApiPrefixMiddleware)
logger = logging.getLogger("uvicorn.error")

ai_router = AIRouter()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    logger.info("[%s] HTTP %s %s", request_id, request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("[%s] Unhandled error", request_id)
        raise
    response.headers["x-request-id"] = request_id
    return response

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception("[%s] Unhandled exception for %s %s", request_id, request.method, request.url.path)
    return PlainTextResponse(f"Internal Server Error (request_id={request_id})", status_code=500)

# Em dev, permitir vÃ¡rias portas locais comuns (vite/app served ports)
# Pode ser sobrescrito definindo a variÃ¡vel de ambiente CORS_ORIGINS
cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)

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

@app.get("/health")
def health():
    return {"ok": True, "time": now_iso()}

@app.get("/me", response_model=UserProfile)
def me(user=Depends(get_current_user)):
    logger.info("GET /me called uid=%s email=%s", user.get("uid"), user.get("email"))
    try:
        db = get_firestore_client()
    except Exception:
        logger.exception("Firestore init failed; returning fallback profile")
        return UserProfile(
            uid=user["uid"],
            name=user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
            email=user.get("email", ""),
            avatar=user.get("picture"),
            credits=_initial_credits(),
            interviews=[],
        )

    try:
        doc = db.collection("users").document(user["uid"]).get()
        if not doc.exists:
            profile = {
                "uid": user["uid"],
                "name": user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
                "displayName": user.get("displayName") or user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
                "email": user.get("email", ""),
                "avatar": user.get("picture"),
                "photoURL": user.get("photoURL") or user.get("picture"),
                "plan": os.environ.get("DEFAULT_PLAN", "free"),
                "credits": _initial_credits(),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }
            db.collection("users").document(user["uid"]).set(profile, merge=True)
            return UserProfile(**profile)
        data = doc.to_dict() or {}
        data.setdefault("uid", user["uid"])
        # fetch last interviews
        try:
            items = []
            q = db.collection("users").document(user["uid"]).collection("interviews").order_by("date", direction=firestore.Query.DESCENDING).limit(20)
            for d in q.stream():
                items.append(d.to_dict())
            data["interviews"] = items
        except Exception:
            data.setdefault("interviews", [])
        return UserProfile(**data)
    except Exception:
        logger.exception("GET /me failed; returning fallback profile")
        return UserProfile(
            uid=user["uid"],
            name=user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
            email=user.get("email", ""),
            avatar=user.get("picture"),
            credits=_initial_credits(),
            interviews=[],
        )


def _get_user_credits(user_uid: str) -> int:
    db = get_firestore_client()
    snap = db.collection("users").document(user_uid).get()
    if not snap.exists:
        return _initial_credits()
    return int((snap.to_dict() or {}).get("credits", 0))


def _debit_credits(user_uid: str, amount: int = 1) -> int:
    db = get_firestore_client()
    user_ref = db.collection("users").document(user_uid)

    @firestore.transactional
    def _tx_charge(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            transaction.set(user_ref, {
                "uid": user_uid,
                "displayName": user_uid,
                "email": "",
                "plan": os.environ.get("DEFAULT_PLAN", "free"),
                "credits": _initial_credits(),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }, merge=True)
            credits = _initial_credits()
        else:
            credits = int((snap.to_dict() or {}).get("credits", 0))

        if credits < amount:
            raise HTTPException(status_code=402, detail="CrÃ©ditos insuficientes")

        transaction.update(user_ref, {"credits": credits - amount, "updatedAt": now_iso()})
        return credits - amount

    return _tx_charge(db.transaction())


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
    raise HTTPException(status_code=e.status_code or 503, detail="AI indisponÃ­vel. Tente novamente.", headers=headers)

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

def _build_plan_prompt_strict(config: InterviewConfig) -> str:
    duration = _clamp_duration_minutes(config)
    min_q, max_q = _plan_question_bounds(duration)
    return f"""
Voce e um entrevistador de engenharia de software.
Retorne SOMENTE um JSON valido, sem markdown e sem texto extra.

Formato EXATO:
{{
  "roleTitleGuess": "string",
  "seniorityGuess": "string",
  "mustHaveSkills": ["skill1","skill2"],
  "blueprint": {{"hr": 20, "technical": 45, "design": 20, "behavioral": 15}},
  "questions": [
    {{"id":"q1","section":"technical","difficulty":3,"prompt":"..."}}
  ]
}}

Config: {config.model_dump()}

Regras:
- Idioma das perguntas: {config.interviewLanguage}
- Se existir jobDescription, adapte perguntas para ela
- Dificuldade deve refletir {config.seniority}
- DuraÃ§Ã£o alvo: {duration} minutos
- questions: {min_q} a {max_q} perguntas
"""

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

def _build_plan_prompt(config: InterviewConfig) -> str:
    duration = _clamp_duration_minutes(config)
    min_q, max_q = _plan_question_bounds(duration)
    return f"""
Voce e um entrevistador de engenharia de software.
Gere um plano de entrevista (estruturado) a partir da configuracao:

Config: {config.model_dump()}

Regras:
- Idioma das perguntas: {config.interviewLanguage}
- Se existir jobDescription, adapte perguntas para ela
- Dificuldade deve refletir {config.seniority}
- blueprint: percentuais 0-100 para secoes (hr, technical, design, behavioral) somando ~100
- DuraÃ§Ã£o alvo: {duration} minutos
- questions: {min_q} a {max_q} perguntas, cada uma com id, section, difficulty (1-5), prompt
Retorne somente JSON, sem markdown e sem texto extra.
"""


def _build_eval_prompt(config: InterviewConfig, question: str, confirmed_name: str, transcript: Optional[str] = None) -> str:
    tasks = """
Tarefas:
1) Transcreva a resposta do audio.
2) Avalie a resposta do {name} em: communication, technical, problemSolving, presence (0-10).
3) Liste 2-5 strengths e 2-5 improvements.
4) Se a resposta foi rasa, indique followUpNeeded=true e proponha followUpQuestion (1 pergunta objetiva).
""".format(name=confirmed_name)

    transcript_block = ""
    if transcript:
        tasks = """
Tarefas:
1) Use a transcricao fornecida (nao transcreva novamente).
2) Avalie a resposta do {name} em: communication, technical, problemSolving, presence (0-10).
3) Liste 2-5 strengths e 2-5 improvements.
4) Se a resposta foi rasa, indique followUpNeeded=true e proponha followUpQuestion (1 pergunta objetiva).
""".format(name=confirmed_name)
        transcript_block = f"""
Transcricao fornecida (copie exatamente para o campo transcript):
\"\"\"{transcript}\"\"\"
"""

    return f"""
Voce e um entrevistador tecnico.
Pergunta: {question}
Senioridade alvo: {config.seniority}
Trilha: {config.track}
Stacks: {", ".join(config.stacks)}
Idioma da entrevista: {config.interviewLanguage}

{tasks}
{transcript_block}

Formato EXATO:
{{
  "transcript": "string",
  "scores": {{"communication": 0, "technical": 0, "problemSolving": 0, "presence": 0}},
  "strengths": ["..."],
  "improvements": ["..."],
  "followUpNeeded": false,
  "followUpQuestion": null
}}

Regras:
- Retorne somente JSON valido, sem markdown e sem texto extra.
- Sempre inclua o campo transcript (use \\n para quebras de linha).
- Se followUpNeeded=false, followUpQuestion deve ser null.
"""


def _normalize_eval_payload(payload: dict, transcript_fallback: Optional[str] = None) -> dict:
    if not isinstance(payload, dict):
        return {}

    # Normalize scores (accept alternate shapes/keys)
    scores = payload.get("scores")
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


def _build_report_prompt(config: InterviewConfig, history: list) -> str:
    return f"""
Analise o historico completo da entrevista e gere um relatorio final.

Config: {config.model_dump()}
Historico: {history}

Retorne somente JSON, sem markdown e sem texto extra. Campos:
- overallScore (0-10)
- levelEstimate (string)
- jobMatch: {{ covered: [..], gaps: [..] }}
- feedback: {{ posture: [..], communication: [..], technical: [..], language: [..] }}
- plan7Days: lista de 7 itens (day: 1-7, task: string)
"""


def _summarize_scores(history: list) -> Optional[tuple[AnswerScores, float]]:
    if not isinstance(history, list):
        return None
    sums = {"communication": 0.0, "technical": 0.0, "problemSolving": 0.0, "presence": 0.0}
    counts = {"communication": 0, "technical": 0, "problemSolving": 0, "presence": 0}

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

    if not any(counts.values()):
        return None

    avg = {}
    for key in sums.keys():
        if counts[key] > 0:
            avg[key] = round(sums[key] / counts[key], 2)
        else:
            avg[key] = 0.0

    overall = round(sum(avg.values()) / len(avg), 2)
    return AnswerScores(**avg), overall


@app.post("/sessions/start", response_model=SessionStartResponse)
def start_session(config: InterviewConfig, user=Depends(get_current_user)):
    config = _normalize_config(config)
    db = get_firestore_client()
    user_ref = db.collection("users").document(user["uid"])

    @firestore.transactional
    def _tx_create(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            transaction.set(user_ref, {
                "uid": user["uid"],
                "name": user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
                "displayName": user.get("displayName") or user.get("name") or user.get("email", "UsuÃ¡rio").split("@")[0],
                "email": user.get("email", ""),
                "avatar": user.get("picture"),
                "photoURL": user.get("photoURL") or user.get("picture"),
                "plan": os.environ.get("DEFAULT_PLAN", "free"),
                "credits": _initial_credits(),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }, merge=True)
            credits = _initial_credits()
        else:
            credits = int((snap.to_dict() or {}).get("credits", 0))

        session_ref = db.collection("sessions").document()
        transaction.set(session_ref, {
            "uid": user["uid"],
            "status": "started",
            "plan_status": "pending",
            "config": config.model_dump(),
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        })
        return session_ref.id, credits

    try:
        session_id, credits = _tx_create(db.transaction())
    except Exception as e:
        logger.exception("start_session transaction failed")
        raise HTTPException(status_code=500, detail="Falha ao iniciar sessao")

    return SessionStartResponse(sessionId=session_id, plan=None, plan_status="pending", credits=credits)


@app.post("/sessions/{session_id}/plan/generate", response_model=PlanGenerateResponse)
def generate_plan(session_id: str, user=Depends(get_current_user)):
    db = get_firestore_client()
    ref = db.collection("sessions").document(session_id)
    snap = ref.get()
    if not snap.exists or (snap.to_dict() or {}).get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    data = snap.to_dict() or {}
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

    credits = _get_user_credits(user["uid"])
    if credits <= 0:
        raise HTTPException(status_code=402, detail="Creditos insuficientes")

    config = InterviewConfig(**data.get("config"))
    prompt = _build_plan_prompt(config)

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
                prompt=_build_plan_prompt_strict(config),
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

    ref.set(
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


@app.post("/ai/name-extract")
def name_extract(payload: NameExtractRequest, user=Depends(get_current_user)):
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
    return {"name": name[0] if name else "Candidato"}


@app.post("/ai/plan", response_model=SessionStartResponse)
def api_ai_plan(config: InterviewConfig, user=Depends(get_current_user)):
    return start_session(config, user)


@app.post("/ai/evaluate", response_model=AnswerEvaluation)
def api_ai_evaluate(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return evaluate_audio(payload, user)


@app.post("/ai/report", response_model=FinalReport)
def api_ai_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return final_report(payload, user)


@app.post("/ai/tts")
def api_tts(body: dict, user=Depends(get_current_user)):
    text = body.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
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
        return {"audioBase64": b64, "mimeType": mime}
    except Exception:
        logger.exception("TTS synth failed")
        raise HTTPException(status_code=503, detail="TTS service unavailable")


@app.post("/ai/evaluate-audio", response_model=AnswerEvaluation)
def evaluate_audio(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    if _get_user_credits(user["uid"]) <= 0:
        raise HTTPException(status_code=402, detail="Creditos insuficientes")

    audio_bytes = _b64_to_bytes(payload.audioBase64)
    transcript_fallback = None
    prompt = _build_eval_prompt(payload.config, payload.question, payload.confirmedName or "o candidato")

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
        evaluation = AnswerEvaluation(**data)
    except Exception:
        try:
            logger.warning("Invalid AI evaluation payload (provider=%s model=%s)", result.provider_used, result.model_used)
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    _debit_credits(user["uid"], amount=1)
    return evaluation


@app.post("/ai/final-report", response_model=FinalReport)
def final_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    if _get_user_credits(user["uid"]) <= 0:
        raise HTTPException(status_code=402, detail="Creditos insuficientes")

    prompt = _build_report_prompt(payload.config, payload.history)
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
            scores_summary, overall = summary
            report_data = report.model_dump()
            report_data["scoresSummary"] = scores_summary.model_dump()
            report_data["overallScore"] = overall
            report = FinalReport(**report_data)
    except Exception:
        raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    _debit_credits(user["uid"], amount=1)
    return report


@app.post("/sessions/{session_id}/finish")
def finish_session(session_id: str, payload: SessionFinishRequest, user=Depends(get_current_user)):
    db = get_firestore_client()
    ref = db.collection("sessions").document(session_id)
    snap = ref.get()
    if not snap.exists or (snap.to_dict() or {}).get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    report = payload.report
    plan = (snap.to_dict() or {}).get("plan", {}) or {}
    config = (snap.to_dict() or {}).get("config", {}) or {}

    history_item = {
        "id": session_id,
        "date": now_iso(),
        "role": plan.get("roleTitleGuess", "Entrevista"),
        "score": float(report.overallScore),
        "style": config.get("style", ""),
        "track": config.get("track", ""),
    }

    user_ref = db.collection("users").document(user["uid"])
    user_ref.set({"updatedAt": now_iso(), "lastInterviewAt": now_iso()}, merge=True)
    user_ref.collection("interviews").document(session_id).set(history_item, merge=True)

    ref.set({
        "status": "finished",
        "report": report.model_dump(),
        "meta": payload.meta,
        "updatedAt": now_iso(),
        "finishedAt": now_iso(),
    }, merge=True)

    return {"ok": True}


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)):
    db = get_firestore_client()
    session_ref = db.collection("sessions").document(session_id)
    snap = session_ref.get()

    if snap.exists and (snap.to_dict() or {}).get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    if snap.exists:
        session_ref.delete()

    user_ref = db.collection("users").document(user["uid"])
    user_ref.collection("interviews").document(session_id).delete()
    return {"ok": True}


@app.post("/credits/dev-add")
def dev_add_credits(amount: int = 3, user=Depends(get_current_user)):
    if os.environ.get("ALLOW_DEV_CREDITS", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Desabilitado")
    if amount <= 0 or amount > 1000:
        raise HTTPException(status_code=400, detail="amount invalido")

    db = get_firestore_client()
    ref = db.collection("users").document(user["uid"])
    snap = ref.get()
    current = int((snap.to_dict() or {}).get("credits", 0)) if snap.exists else 0
    ref.set({"credits": current + int(amount), "updatedAt": now_iso()}, merge=True)
    return {"credits": current + int(amount)}


def _b64_to_bytes(b64: str) -> bytes:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    pad = "=" * (-len(b64) % 4)
    return base64.b64decode(b64 + pad)


# Kiwify webhook helpers

def _get_nested(d: dict, path: str):
    cur = d
    for key in path.split("."):
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def _extract_email(payload: dict) -> str | None:
    candidates = [
        "email",
        "customer.email",
        "buyer.email",
        "client.email",
        "user.email",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and "@" in val:
            return val.strip().lower()
    return None


def _extract_product_key(payload: dict) -> str | None:
    candidates = [
        "product_id",
        "product.id",
        "product",
        "product_name",
        "product.name",
        "offer.name",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _extract_event_id(payload: dict) -> str | None:
    candidates = [
        "transaction_id",
        "order_id",
        "id",
        "event_id",
    ]
    for path in candidates:
        val = _get_nested(payload, path)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, (int, float)):
            return str(val)
    return None


def _is_approved(payload: dict) -> bool:
    event = str(payload.get("event") or payload.get("trigger") or payload.get("type") or "").lower()
    status = str(payload.get("status") or payload.get("payment_status") or "").lower()
    approved = {"compra_aprovada", "approved", "paid", "payment_approved", "payment_confirmed"}
    return event in approved or status in approved


def _load_kiwify_mapping() -> dict:
    raw = os.environ.get("KIWIFY_PRODUCT_CREDITS", "").strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        logger.warning("Invalid KIWIFY_PRODUCT_CREDITS JSON")
        return {}


def _map_credits(product_key: str | None, mapping: dict) -> int | None:
    if not product_key:
        return None
    if product_key in mapping:
        return int(mapping[product_key])
    for k, v in mapping.items():
        if isinstance(k, str) and k.lower() == product_key.lower():
            return int(v)
    return None


async def _handle_kiwify_payload(payload: dict):
    if not _is_approved(payload):
        return {"ok": True, "ignored": "not_approved"}

    email = _extract_email(payload)
    if not email:
        return {"ok": True, "ignored": "email_not_found"}

    product_key = _extract_product_key(payload)
    mapping = _load_kiwify_mapping()
    credits = _map_credits(product_key, mapping)
    if not credits:
        return {"ok": True, "ignored": "product_not_mapped"}

    event_id = _extract_event_id(payload)
    if not event_id:
        return {"ok": True, "ignored": "missing_transaction_id"}

    db = get_firestore_client()
    ledger_ref = db.collection("credits_ledger").document(event_id)
    if ledger_ref.get().exists:
        return {"ok": True, "ignored": "duplicate"}

    user_query = db.collection("users").where("email", "==", email).limit(1).get()
    if not user_query:
        ledger_ref.set({"email": email, "status": "user_not_found", "payload": payload}, merge=True)
        return {"ok": True, "ignored": "user_not_found"}

    user_ref = user_query[0].reference
    user_ref.set({"credits": firestore.Increment(int(credits)), "updatedAt": now_iso()}, merge=True)
    ledger_ref.set(
        {
            "email": email,
            "credits": int(credits),
            "product": product_key,
            "status": "credited",
            "createdAt": now_iso(),
            "payload": payload,
        },
        merge=True,
    )
    return {"ok": True, "credited": int(credits)}


@app.post("/webhooks/kiwify")
async def kiwify_webhook(request: Request):
    token_required = os.environ.get("KIWIFY_WEBHOOK_TOKEN")
    if token_required:
        header_token = request.headers.get("x-kiwify-token") or request.headers.get("X-Kiwify-Token")
        query_token = request.query_params.get("token")
        if token_required != (header_token or query_token):
            raise HTTPException(status_code=401, detail="Invalid webhook token")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    return await _handle_kiwify_payload(payload)


@app.post("/webhooks/kiwify/test")
async def kiwify_webhook_test(request: Request):
    token_required = os.environ.get("KIWIFY_WEBHOOK_TOKEN")
    if token_required:
        header_token = request.headers.get("x-kiwify-token") or request.headers.get("X-Kiwify-Token")
        query_token = request.query_params.get("token")
        if token_required != (header_token or query_token):
            raise HTTPException(status_code=401, detail="Invalid webhook token")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    payload.setdefault("event", "compra_aprovada")
    return await _handle_kiwify_payload(payload)
