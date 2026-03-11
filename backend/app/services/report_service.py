from __future__ import annotations

from . import interview_core


def final_report(payload, user):
    return interview_core.final_report(payload, user)


def ai_report(payload, user):
    return interview_core.api_ai_report(payload, user)
