from __future__ import annotations

from . import interview_core


def start_session(config, user):
    return interview_core.start_session(config, user)


def finish_session(session_id: str, payload, user):
    return interview_core.finish_session(session_id, payload, user)


def delete_session(session_id: str, user):
    return interview_core.delete_session(session_id, user)


def evaluate_audio(payload, user):
    return interview_core.evaluate_audio(payload, user)


def next_question(payload, user):
    return interview_core.next_question(payload, user)
