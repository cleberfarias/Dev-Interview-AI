from __future__ import annotations

from . import evaluation_service, interview_core, planning_service, report_service


def name_extract(payload, user):
    return interview_core.name_extract(payload, user)


def ai_plan(config, user):
    return planning_service.ai_plan(config, user)


def ai_evaluate(payload, user):
    return evaluation_service.evaluate_audio(payload, user)


def ai_report(payload, user):
    return report_service.ai_report(payload, user)


def next_question(payload, user):
    return planning_service.next_question(payload, user)


def tts(body, user):
    return interview_core.api_tts(body, user)


def evaluate_audio(payload, user):
    return evaluation_service.evaluate_audio(payload, user)


def evaluate_text(payload, user):
    return evaluation_service.evaluate_text(payload, user)


def final_report(payload, user):
    return report_service.final_report(payload, user)
