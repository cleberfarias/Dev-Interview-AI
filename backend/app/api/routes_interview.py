from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import (
    AnswerEvaluation,
    FinalReport,
    FinalReportRequest,
    InterviewConfig,
    NameExtractRequest,
    NextQuestionRequest,
    NextQuestionResponse,
    EvaluateAudioRequest,
    PlanGenerateResponse,
    SessionFinishRequest,
    SessionStartResponse,
    UserProfile,
)
from ..services import ai_service, credits_service, profile_service, session_service
from ..services import interview_core

router = APIRouter()

# Compatibility exports
ai_router = interview_core.ai_router
mcp_get_recent_interviews = interview_core.mcp_get_recent_interviews
mcp_get_rubric = interview_core.mcp_get_rubric


def now_iso() -> str:
    return interview_core.now_iso()


def _get_user_credits(user_uid: str) -> int:
    return interview_core._get_user_credits(user_uid)


def _debit_credits(user_uid: str, amount: int = 1) -> int:
    return interview_core._debit_credits(user_uid, amount)


def _safe_json_loads(text: str):
    return interview_core._safe_json_loads(text)


def _normalize_eval_payload(payload: dict, transcript_fallback=None):
    return interview_core._normalize_eval_payload(payload, transcript_fallback=transcript_fallback)


def _build_plan_context(user_uid: str, config: InterviewConfig, auth_token=None) -> str:
    return interview_core._build_plan_context(user_uid, config, auth_token=auth_token)


def _build_report_context(user_uid: str, config: InterviewConfig, auth_token=None) -> str:
    return interview_core._build_report_context(user_uid, config, auth_token=auth_token)


def _build_eval_prompt(
    config: InterviewConfig,
    question: str,
    confirmed_name: str,
    transcript=None,
    auth_token=None,
) -> str:
    return interview_core._build_eval_prompt(
        config,
        question,
        confirmed_name,
        transcript=transcript,
        auth_token=auth_token,
    )


@router.get("/health")
def health():
    return profile_service.health()


@router.get("/me", response_model=UserProfile)
def me(user=Depends(get_current_user)):
    return profile_service.me(user)


@router.post("/sessions/start", response_model=SessionStartResponse)
def start_session(config: InterviewConfig, user=Depends(get_current_user)):
    return session_service.start_session(config, user)


@router.post("/sessions/{session_id}/plan/generate", response_model=PlanGenerateResponse)
def generate_plan(session_id: str, user=Depends(get_current_user)):
    return session_service.generate_plan(session_id, user)


@router.post("/sessions/{session_id}/finish")
def finish_session(session_id: str, payload: SessionFinishRequest, user=Depends(get_current_user)):
    return session_service.finish_session(session_id, payload, user)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)):
    return session_service.delete_session(session_id, user)


@router.post("/ai/name-extract")
def name_extract(payload: NameExtractRequest, user=Depends(get_current_user)):
    return ai_service.name_extract(payload, user)


@router.post("/ai/plan", response_model=SessionStartResponse)
def api_ai_plan(config: InterviewConfig, user=Depends(get_current_user)):
    return ai_service.ai_plan(config, user)


@router.post("/ai/evaluate", response_model=AnswerEvaluation)
def api_ai_evaluate(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return ai_service.ai_evaluate(payload, user)


@router.post("/ai/report", response_model=FinalReport)
def api_ai_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return ai_service.ai_report(payload, user)


@router.post("/ai/next-question", response_model=NextQuestionResponse)
def next_question(payload: NextQuestionRequest, user=Depends(get_current_user)):
    return ai_service.next_question(payload, user)


@router.post("/ai/tts")
def api_tts(body: dict, user=Depends(get_current_user)):
    return ai_service.tts(body, user)


@router.post("/ai/evaluate-audio", response_model=AnswerEvaluation)
def evaluate_audio(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return ai_service.evaluate_audio(payload, user)


@router.post("/ai/final-report", response_model=FinalReport)
def final_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return ai_service.final_report(payload, user)


@router.post("/credits/dev-add")
def dev_add_credits(amount: int = 3, user=Depends(get_current_user)):
    return credits_service.dev_add_credits(amount, user)
