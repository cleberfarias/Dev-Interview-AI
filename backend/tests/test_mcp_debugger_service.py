from app.services import mcp_debugger_service


def test_get_mcp_tool_debugger_backfills_session_trace_workflow_summary(monkeypatch):
    monkeypatch.setattr(
        "app.services.mcp_debugger_service.mcp_client.get_candidate_memory",
        lambda uid, auth_token=None: {
            "toolName": "get_candidate_memory",
            "contractVersion": "mcp.devinterview.v1",
            "hasMemory": False,
            "memory": None,
        },
    )
    monkeypatch.setattr(
        "app.services.mcp_debugger_service.mcp_client.get_resume_analysis",
        lambda uid, auth_token=None: {
            "toolName": "get_resume_analysis",
            "contractVersion": "mcp.devinterview.v1",
            "found": False,
            "analysis": None,
        },
    )
    monkeypatch.setattr(
        "app.services.mcp_debugger_service.mcp_client.get_job_analysis",
        lambda uid, auth_token=None: {
            "toolName": "get_job_analysis",
            "contractVersion": "mcp.devinterview.v1",
            "found": False,
            "analysis": None,
        },
    )
    monkeypatch.setattr(
        "app.services.mcp_debugger_service.mcp_client.search_rubric_knowledge",
        lambda track, seniority, stacks, question=None, auth_token=None: {
            "toolName": "search_rubric_knowledge",
            "contractVersion": "mcp.devinterview.v1",
            "summary": "Rubrica pronta.",
            "focus": ["clarity"],
        },
    )
    monkeypatch.setattr(
        "app.services.mcp_debugger_service.mcp_client.get_session_trace",
        lambda uid, session_id, auth_token=None: {
            "toolName": "get_session_trace",
            "contractVersion": "mcp.devinterview.v1",
            "sessionId": session_id,
            "hasTrace": True,
            "analysisTraceSnapshot": {
                "capturedAt": "2026-03-31T13:55:00+00:00",
                "agentRuntime": {
                    "candidate_agent": {"status": "completed"},
                    "job_agent": {"status": "completed"},
                },
                "knowledgeRetrieval": {"retrievalMode": "semantic", "quality": "good"},
                "contextToolCalls": [{"toolName": "search_rubric_knowledge"}],
                "turnEvidenceTimeline": {
                    "answers": {
                        "answer-1": {
                            "answerId": "answer-1",
                            "capturedAt": "2026-03-31T13:56:00+00:00",
                            "clientRuntime": {"transportState": "avatar/tts em saida"},
                        }
                    }
                },
                "reportEvidence": {"toolCalls": [{"toolName": "search_rubric_knowledge"}]},
            },
        },
    )

    result = mcp_debugger_service.get_mcp_tool_debugger(
        {"uid": "user-1", "token": "token"},
        session_id="session-1",
        track="frontend",
        seniority="mid",
        stacks=["React", "TypeScript"],
    )

    trace = next(item for item in result["tools"] if item["name"] == "get_session_trace")

    assert trace["summary"].startswith("Workflow com 4/4 etapa(s) prontas")
    assert trace["data"]["workflowSummary"]["currentStage"] == "report"
    assert trace["data"]["workflowSummary"]["retrievalMode"] == "semantic"
    assert trace["data"]["workflowSummary"]["contextToolCallCount"] == 1
