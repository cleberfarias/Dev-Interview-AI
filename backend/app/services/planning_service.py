from __future__ import annotations

from . import interview_core


def generate_plan(session_id: str, user):
    return interview_core.generate_plan(session_id, user)


def ai_plan(config, user):
    return interview_core.api_ai_plan(config, user)


def next_question(payload, user):
    return interview_core.next_question(payload, user)
