from app.schemas import InterviewConfig
from app.services import interview_core


def _config() -> InterviewConfig:
    return InterviewConfig(
        uiLanguage="pt-BR",
        interviewLanguage="pt-BR",
        track="backend",
        seniority="mid",
        stacks=["python", "fastapi"],
        style="friendly",
        duration=15,
        jobDescription="Backend role",
        plan="free",
    )


def _user() -> dict:
    return {
        "uid": "session-user-1",
        "email": "session@example.com",
        "name": "Session User",
        "picture": None,
        "token": "token",
    }


def test_start_session_includes_profile_trace_snapshot(monkeypatch):
    captured = {}

    def _fake_create_pending_session(**kwargs):
        captured.update(kwargs)
        return "session-123", 5

    monkeypatch.setattr(
        "app.services.session_service.candidate_profile_repository.get_profile",
        lambda uid: {
            "userId": uid,
            "lastResumeAnalysisTrace": {
                "source": "hybrid",
                "aiProvider": "openai",
                "aiModel": "gpt-4o-mini",
            },
            "lastJobAnalysisTrace": {
                "source": "heuristic",
                "aiProvider": None,
                "aiModel": None,
            },
            "analysisAudit": [
                {"kind": "resume", "source": "hybrid", "createdAt": "2026-03-11T00:00:00+00:00"},
                {"kind": "job", "source": "heuristic", "createdAt": "2026-03-10T00:00:00+00:00"},
            ],
        },
    )
    monkeypatch.setattr(
        "app.services.session_service.session_repository.create_pending_session",
        _fake_create_pending_session,
    )

    result = interview_core.start_session(_config(), _user())
    assert result.sessionId == "session-123"
    assert result.credits == 5

    snapshot = captured.get("analysis_trace_snapshot")
    assert isinstance(snapshot, dict)
    assert snapshot.get("lastResumeAnalysisTrace", {}).get("source") == "hybrid"
    assert snapshot.get("lastJobAnalysisTrace", {}).get("source") == "heuristic"
    assert isinstance(snapshot.get("analysisAuditRecent"), list)
    assert len(snapshot.get("analysisAuditRecent")) == 2


def test_start_session_continues_without_trace_snapshot(monkeypatch):
    captured = {}

    def _fake_create_pending_session(**kwargs):
        captured.update(kwargs)
        return "session-456", 3

    def _broken_get_profile(_uid):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(
        "app.services.session_service.candidate_profile_repository.get_profile",
        _broken_get_profile,
    )
    monkeypatch.setattr(
        "app.services.session_service.session_repository.create_pending_session",
        _fake_create_pending_session,
    )

    result = interview_core.start_session(_config(), _user())
    assert result.sessionId == "session-456"
    assert result.credits == 3
    assert captured.get("analysis_trace_snapshot") is None
