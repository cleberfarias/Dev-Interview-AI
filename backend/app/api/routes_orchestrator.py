from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import (
    OrchestratorContextRequest,
    OrchestratorContextResponse,
    OrchestratorFinalizeRequest,
    OrchestratorFinalizeResponse,
    OrchestratorStartRequest,
    OrchestratorStartResponse,
    OrchestratorTurnRequest,
    OrchestratorTurnResponse,
)
from ..services import orchestrator_service

router = APIRouter()


@router.post("/orchestrator/interview/context", response_model=OrchestratorContextResponse)
def build_orchestrator_context(payload: OrchestratorContextRequest, user=Depends(get_current_user)):
    return orchestrator_service.build_context(payload, user)


@router.post("/orchestrator/interview/start", response_model=OrchestratorStartResponse)
def start_orchestrated_interview(payload: OrchestratorStartRequest, user=Depends(get_current_user)):
    return orchestrator_service.start(payload, user)


@router.post("/orchestrator/interview/turn", response_model=OrchestratorTurnResponse)
def run_orchestrated_turn(payload: OrchestratorTurnRequest, user=Depends(get_current_user)):
    return orchestrator_service.run_turn(payload, user)


@router.post("/orchestrator/interview/finalize", response_model=OrchestratorFinalizeResponse)
def finalize_orchestrated_interview(payload: OrchestratorFinalizeRequest, user=Depends(get_current_user)):
    return orchestrator_service.finalize(payload, user)
