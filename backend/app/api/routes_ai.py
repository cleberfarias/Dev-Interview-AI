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
    EvaluateTextRequest,
    SessionStartResponse,
)
from ..services import ai_service

router = APIRouter()

# Official interview lifecycle is exposed by /interview/* (routes_orchestrator.py).
# /ai/* remains focused on utility and legacy compatibility endpoints.


@router.post("/ai/name-extract")
def name_extract(payload: NameExtractRequest, user=Depends(get_current_user)):
    return ai_service.name_extract(payload, user)


@router.post("/ai/plan", response_model=SessionStartResponse, deprecated=True)
def ai_plan(config: InterviewConfig, user=Depends(get_current_user)):
    return ai_service.ai_plan(config, user)


@router.post("/ai/evaluate", response_model=AnswerEvaluation, deprecated=True)
def ai_evaluate(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return ai_service.ai_evaluate(payload, user)


@router.post("/ai/report", response_model=FinalReport, deprecated=True)
def ai_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return ai_service.ai_report(payload, user)


@router.post("/ai/next-question", response_model=NextQuestionResponse, deprecated=True)
def next_question(payload: NextQuestionRequest, user=Depends(get_current_user)):
    return ai_service.next_question(payload, user)


@router.post("/ai/tts")
def tts(body: dict, user=Depends(get_current_user)):
    return ai_service.tts(body, user)


@router.post("/ai/evaluate-audio", response_model=AnswerEvaluation, deprecated=True)
def evaluate_audio(payload: EvaluateAudioRequest, user=Depends(get_current_user)):
    return ai_service.evaluate_audio(payload, user)


@router.post("/ai/evaluate-text", response_model=AnswerEvaluation, deprecated=True)
def evaluate_text(payload: EvaluateTextRequest, user=Depends(get_current_user)):
    return ai_service.evaluate_text(payload, user)


@router.post("/ai/final-report", response_model=FinalReport, deprecated=True)
def final_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return ai_service.final_report(payload, user)
