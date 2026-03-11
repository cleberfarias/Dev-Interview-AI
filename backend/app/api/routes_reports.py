from __future__ import annotations

from fastapi import APIRouter, Depends

from ..firebase_admin import get_current_user
from ..schemas import FinalReport, FinalReportRequest
from ..services import report_service

router = APIRouter()


@router.post("/reports/final", response_model=FinalReport)
def generate_final_report(payload: FinalReportRequest, user=Depends(get_current_user)):
    return report_service.final_report(payload, user)
