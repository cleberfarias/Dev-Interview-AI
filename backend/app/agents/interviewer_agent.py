from __future__ import annotations

from ..schemas import InterviewConfig, NextQuestionRequest
from ..services import interview_core


def run(
    *,
    config: InterviewConfig,
    history: list[dict],
    remaining_seconds: int,
    difficulty_level: int | None,
    user: dict,
) -> dict:
    payload = NextQuestionRequest(
        config=config,
        history=history,
        remainingSeconds=remaining_seconds,
        difficultyLevel=difficulty_level,
    )
    return interview_core.next_question(payload, user).model_dump()

