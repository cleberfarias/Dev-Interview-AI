from fastapi import HTTPException

from app.services import session_service


def test_get_session_analysis_trace_returns_snapshot(monkeypatch):
    monkeypatch.setattr(
        "app.services.session_service.session_repository.get_session",
        lambda session_id: {
            "uid": "user-1",
            "analysisTraceSnapshot": {"capturedAt": "2026-03-11T00:00:00+00:00"},
        },
    )

    result = session_service.get_session_analysis_trace("sess-1", {"uid": "user-1"})
    assert result.sessionId == "sess-1"
    assert result.hasTrace is True
    assert result.analysisTraceSnapshot is not None


def test_get_session_analysis_trace_raises_for_missing_or_foreign_session(monkeypatch):
    monkeypatch.setattr(
        "app.services.session_service.session_repository.get_session",
        lambda session_id: None,
    )

    try:
        session_service.get_session_analysis_trace("sess-404", {"uid": "user-1"})
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 404
