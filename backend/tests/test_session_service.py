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


def test_get_session_report_returns_saved_report(monkeypatch):
    monkeypatch.setattr(
        "app.services.session_service.session_repository.get_session",
        lambda session_id: {
            "uid": "user-1",
            "config": {
                "uiLanguage": "pt-BR",
                "interviewLanguage": "pt-BR",
                "track": "frontend",
                "seniority": "mid",
                "stacks": ["React", "TypeScript"],
                "style": "friendly",
                "duration": 10,
                "plan": "free",
                "jobDescription": "",
                "interviewMode": "candidate_coaching_mode",
            },
            "report": {
                "overallScore": 7.8,
                "levelEstimate": "mid",
                "jobMatch": {"covered": ["react"], "gaps": ["arquitetura"]},
                "feedback": {
                    "posture": [],
                    "communication": ["Seja mais objetivo."],
                    "technical": ["Bom dominio de React."],
                    "language": [],
                },
                "plan7Days": [],
            },
        },
    )

    result = session_service.get_session_report("sess-1", {"uid": "user-1"})
    assert result.sessionId == "sess-1"
    assert result.hasReport is True
    assert result.report is not None
    assert result.report.overallScore == 7.8
    assert result.config is not None
    assert result.config.track == "frontend"


def test_store_trace_helpers_delegate_to_repository(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        "app.services.session_service.session_repository.get_session",
        lambda session_id: {"uid": "user-1"},
    )
    monkeypatch.setattr(
        "app.services.session_service.session_repository.merge_turn_evidence_trace",
        lambda session_id, answer_id, data: captured.setdefault(
            "turn",
            {"sessionId": session_id, "answerId": answer_id, "data": data},
        ),
    )
    monkeypatch.setattr(
        "app.services.session_service.session_repository.merge_report_evidence_trace",
        lambda session_id, data: captured.setdefault(
            "report",
            {"sessionId": session_id, "data": data},
        ),
    )

    session_service.store_turn_evidence_trace(
        "sess-1",
        "answer-1",
        {
            "nextQuestionContext": {
                "retrievalMode": "semantic",
                "toolCalls": [{"toolName": "search_rubric_knowledge", "status": "ready"}],
            }
        },
        {"uid": "user-1"},
    )
    session_service.store_report_evidence_trace(
        "sess-1",
        {
            "retrievalMode": "semantic",
            "toolCalls": [{"toolName": "search_rubric_knowledge", "status": "ready"}],
        },
        {"uid": "user-1"},
    )

    assert captured["turn"]["answerId"] == "answer-1"
    assert captured["turn"]["data"]["nextQuestionContext"]["retrievalMode"] == "semantic"
    assert captured["turn"]["data"]["nextQuestionContext"]["toolCalls"][0]["toolName"] == "search_rubric_knowledge"
    assert captured["report"]["sessionId"] == "sess-1"
    assert captured["report"]["data"]["retrievalMode"] == "semantic"
    assert captured["report"]["data"]["toolCalls"][0]["toolName"] == "search_rubric_knowledge"
