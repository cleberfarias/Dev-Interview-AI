from __future__ import annotations

from ..schemas import FinalReportRequest, InterviewConfig
from ..services import report_service


def run(*, config: InterviewConfig, history: list[dict], user: dict, session_id: str | None = None) -> dict:
    payload = FinalReportRequest(config=config, history=history, sessionId=session_id)
    return report_service.final_report(payload, user).model_dump()
