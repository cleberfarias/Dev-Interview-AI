from __future__ import annotations

from ..schemas import EvaluateAudioRequest, EvaluateTextRequest, InterviewConfig
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


def run_audio(
    *,
    config: InterviewConfig,
    question: str,
    audio_base64: str,
    mime_type: str,
    confirmed_name: str | None,
    user: dict,
) -> dict:
    payload = EvaluateAudioRequest(
        config=config,
        question=question,
        audioBase64=audio_base64,
        mimeType=mime_type,
        confirmedName=confirmed_name or "candidato",
    )
    return interview_core.evaluate_audio(payload, user).model_dump()
