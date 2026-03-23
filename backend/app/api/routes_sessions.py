from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import (
    InterviewConfig,
    PlanGenerateResponse,
    SessionAnalysisTraceResponse,
    SessionFinishRequest,
    SessionReportResponse,
    SessionStartResponse,
)
from ..services import session_service

router = APIRouter()


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


@router.get("/sessions/{session_id}/analysis-trace", response_model=SessionAnalysisTraceResponse)
def get_session_analysis_trace(session_id: str, user=Depends(get_current_user)):
    return session_service.get_session_analysis_trace(session_id, user)


@router.get("/sessions/{session_id}/report", response_model=SessionReportResponse)
def get_session_report(session_id: str, user=Depends(get_current_user)):
    return session_service.get_session_report(session_id, user)
