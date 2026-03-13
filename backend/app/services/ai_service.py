from __future__ import annotations

from . import ai_utility_service, evaluation_service, planning_service, report_service


def name_extract(payload, user):
    return ai_utility_service.name_extract(payload, user)


def ai_plan(config, user):
    return planning_service.ai_plan(config, user)


def ai_evaluate(payload, user):
    return evaluation_service.evaluate_audio(payload, user)


def ai_report(payload, user):
    return report_service.ai_report(payload, user)


def next_question(payload, user):
    return planning_service.next_question(payload, user)


def tts(body, user):
    return ai_utility_service.tts(body, user)


def evaluate_audio(payload, user):
    return evaluation_service.evaluate_audio(payload, user)


def evaluate_text(payload, user):
    return evaluation_service.evaluate_text(payload, user)


def final_report(payload, user):
    return report_service.final_report(payload, user)
