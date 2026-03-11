from __future__ import annotations

from . import interview_core


def name_extract(payload, user):
    return interview_core.name_extract(payload, user)


def ai_plan(config, user):
    return interview_core.api_ai_plan(config, user)


def ai_evaluate(payload, user):
    return interview_core.api_ai_evaluate(payload, user)


def ai_report(payload, user):
    return interview_core.api_ai_report(payload, user)


def next_question(payload, user):
    return interview_core.next_question(payload, user)


def tts(body, user):
    return interview_core.api_tts(body, user)


def evaluate_audio(payload, user):
    return interview_core.evaluate_audio(payload, user)


def evaluate_text(payload, user):
    return interview_core.evaluate_text(payload, user)


def final_report(payload, user):
    return interview_core.final_report(payload, user)
