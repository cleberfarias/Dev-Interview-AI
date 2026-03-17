from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from .request_context import get_request_id, get_session_id, get_user_id


_STANDARD_LOG_RECORD_FIELDS = set(logging.makeLogRecord({}).__dict__.keys()) | {"message", "asctime"}
_CONFIGURED = False


class CloudLoggingJsonFormatter(logging.Formatter):
    _severity_map = {
        "CRITICAL": "CRITICAL",
        "ERROR": "ERROR",
        "WARNING": "WARNING",
        "INFO": "INFO",
        "DEBUG": "DEBUG",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "severity": self._severity_map.get(record.levelname, record.levelname),
            "message": record.getMessage(),
            "logger": record.name,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }

        request_id = getattr(record, "request_id", None) or get_request_id()
        user_id = getattr(record, "user_id", None) or get_user_id()
        session_id = getattr(record, "session_id", None) or get_session_id()

        if request_id:
            payload["request_id"] = request_id
        if user_id:
            payload["user_id"] = user_id
        if session_id:
            payload["session_id"] = session_id

        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_FIELDS or key.startswith("_"):
                continue
            if value is None:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str, ensure_ascii=True)


def _should_use_json_logs() -> bool:
    configured_format = os.getenv("LOG_FORMAT", "").strip().lower()
    if configured_format in {"json", "structured"}:
        return True
    if configured_format in {"plain", "text"}:
        return False
    return bool(os.getenv("K_SERVICE"))


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED or not _should_use_json_logs():
        return

    formatter = CloudLoggingJsonFormatter()
    logger_names = ("", "uvicorn", "uvicorn.error", "uvicorn.access")

    for name in logger_names:
        logger = logging.getLogger(name)
        if name == "" and not logger.handlers:
            logger.addHandler(logging.StreamHandler())
        for handler in logger.handlers:
            handler.setFormatter(formatter)

    _CONFIGURED = True
