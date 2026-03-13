from __future__ import annotations

from ..schemas import FinalReportRequest, InterviewConfig
from ..services import report_service


def run(*, config: InterviewConfig, history: list[dict], user: dict) -> dict:
    payload = FinalReportRequest(config=config, history=history)
    return report_service.final_report(payload, user).model_dump()
