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
from ..services import interview_orchestrator

router = APIRouter()

OFFICIAL_INTERVIEW_PREFIX = "/interview"
LEGACY_ORCHESTRATOR_PREFIX = "/orchestrator/interview"


def _build_context(payload: OrchestratorContextRequest, user):
    data = interview_orchestrator.build_orchestrated_context(payload=payload, user=user)
    return OrchestratorContextResponse(**data)


def _start(payload: OrchestratorStartRequest, user):
    data = interview_orchestrator.start_orchestrated_interview(payload=payload, user=user)
    return OrchestratorStartResponse(**data)


def _run_turn(payload: OrchestratorTurnRequest, user):
    data = interview_orchestrator.run_orchestrated_turn(payload=payload, user=user)
    return OrchestratorTurnResponse(**data)


def _finalize(payload: OrchestratorFinalizeRequest, user):
    data = interview_orchestrator.finalize_orchestrated_interview(payload=payload, user=user)
    return OrchestratorFinalizeResponse(**data)


@router.post(f"{OFFICIAL_INTERVIEW_PREFIX}/context", response_model=OrchestratorContextResponse)
def build_interview_context(payload: OrchestratorContextRequest, user=Depends(get_current_user)):
    return _build_context(payload, user)


@router.post(f"{OFFICIAL_INTERVIEW_PREFIX}/start", response_model=OrchestratorStartResponse)
def start_interview(payload: OrchestratorStartRequest, user=Depends(get_current_user)):
    return _start(payload, user)


@router.post(f"{OFFICIAL_INTERVIEW_PREFIX}/turn", response_model=OrchestratorTurnResponse)
def run_interview_turn(payload: OrchestratorTurnRequest, user=Depends(get_current_user)):
    return _run_turn(payload, user)


@router.post(f"{OFFICIAL_INTERVIEW_PREFIX}/finalize", response_model=OrchestratorFinalizeResponse)
def finalize_interview(payload: OrchestratorFinalizeRequest, user=Depends(get_current_user)):
    return _finalize(payload, user)


@router.post(
    f"{LEGACY_ORCHESTRATOR_PREFIX}/context",
    response_model=OrchestratorContextResponse,
    deprecated=True,
)
def build_orchestrator_context_legacy(payload: OrchestratorContextRequest, user=Depends(get_current_user)):
    return _build_context(payload, user)


@router.post(
    f"{LEGACY_ORCHESTRATOR_PREFIX}/start",
    response_model=OrchestratorStartResponse,
    deprecated=True,
)
def start_orchestrated_interview_legacy(payload: OrchestratorStartRequest, user=Depends(get_current_user)):
    return _start(payload, user)


@router.post(
    f"{LEGACY_ORCHESTRATOR_PREFIX}/turn",
    response_model=OrchestratorTurnResponse,
    deprecated=True,
)
def run_orchestrated_turn_legacy(payload: OrchestratorTurnRequest, user=Depends(get_current_user)):
    return _run_turn(payload, user)


@router.post(
    f"{LEGACY_ORCHESTRATOR_PREFIX}/finalize",
    response_model=OrchestratorFinalizeResponse,
    deprecated=True,
)
def finalize_orchestrated_interview_legacy(payload: OrchestratorFinalizeRequest, user=Depends(get_current_user)):
    return _finalize(payload, user)
