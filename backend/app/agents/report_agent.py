from __future__ import annotations

from ..schemas import FinalReportRequest, InterviewConfig
from ..services import interview_core


def run(*, config: InterviewConfig, history: list[dict], user: dict) -> dict:
    payload = FinalReportRequest(config=config, history=history)
    return interview_core.final_report(payload, user).model_dump()

