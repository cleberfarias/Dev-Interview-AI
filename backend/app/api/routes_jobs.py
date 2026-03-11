from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import JobAnalyzeRequest, JobAnalyzeResponse
from ..services import jobs_service

router = APIRouter()


@router.post("/jobs/analyze", response_model=JobAnalyzeResponse)
def analyze_job(payload: JobAnalyzeRequest, user=Depends(get_current_user)):
    return jobs_service.analyze_job(payload, user)

