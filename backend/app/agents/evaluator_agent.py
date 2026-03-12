from __future__ import annotations

from ..schemas import EvaluateTextRequest, InterviewConfig
from ..services import interview_core


def run_text(
    *,
    config: InterviewConfig,
    question: str,
    transcript: str,
    confirmed_name: str | None,
    user: dict,
) -> dict:
    payload = EvaluateTextRequest(
        config=config,
        question=question,
        transcript=transcript,
        confirmedName=confirmed_name or "candidato",
    )
    return interview_core.evaluate_text(payload, user).model_dump()

