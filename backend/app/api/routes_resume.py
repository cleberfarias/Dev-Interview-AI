from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import ResumeAnalyzeRequest, ResumeAnalyzeResponse
from ..services import resume_service

router = APIRouter()


@router.post("/resume/analyze", response_model=ResumeAnalyzeResponse)
def analyze_resume(payload: ResumeAnalyzeRequest, user=Depends(get_current_user)):
    return resume_service.analyze_resume(payload, user)

