from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Iterator


_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
_user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)
_session_id_var: ContextVar[str | None] = ContextVar("session_id", default=None)
_UNSET = object()


def set_context(
    *,
    request_id: str | None | object = _UNSET,
    user_id: str | None | object = _UNSET,
    session_id: str | None | object = _UNSET,
) -> dict[str, Token]:
    tokens: dict[str, Token] = {}
    if request_id is not _UNSET:
        tokens["request_id"] = _request_id_var.set(request_id if isinstance(request_id, str) else None)
    if user_id is not _UNSET:
        tokens["user_id"] = _user_id_var.set(user_id if isinstance(user_id, str) else None)
    if session_id is not _UNSET:
        tokens["session_id"] = _session_id_var.set(session_id if isinstance(session_id, str) else None)
    return tokens


def reset_context(tokens: dict[str, Token]) -> None:
    token = tokens.get("request_id")
    if token is not None:
        _request_id_var.reset(token)
    token = tokens.get("user_id")
    if token is not None:
        _user_id_var.reset(token)
    token = tokens.get("session_id")
    if token is not None:
        _session_id_var.reset(token)


@contextmanager
def scoped_context(
    *,
    request_id: str | None | object = _UNSET,
    user_id: str | None | object = _UNSET,
    session_id: str | None | object = _UNSET,
) -> Iterator[None]:
    tokens = set_context(request_id=request_id, user_id=user_id, session_id=session_id)
    try:
        yield
    finally:
        reset_context(tokens)


def get_request_id() -> str | None:
    return _request_id_var.get()


def get_user_id() -> str | None:
    return _user_id_var.get()


def get_session_id() -> str | None:
    return _session_id_var.get()
