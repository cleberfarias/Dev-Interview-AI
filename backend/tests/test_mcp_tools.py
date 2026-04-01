from app import mcp_tools


class _Doc:
    def __init__(self, exists, data):
        self.exists = exists
        self._data = data

    def to_dict(self):
        return self._data


class _SessionDocument:
    def __init__(self, data_by_id):
        self.data_by_id = data_by_id
        self.session_id = None

    def document(self, session_id):
        self.session_id = session_id
        return self

    def get(self):
        data = self.data_by_id.get(self.session_id)
        return _Doc(data is not None, data)


class _Db:
    def __init__(self, data_by_id):
        self.data_by_id = data_by_id

    def collection(self, name):
        assert name == "sessions"
        return _SessionDocument(self.data_by_id)


def test_get_session_trace_returns_snapshot_for_owner(monkeypatch):
    monkeypatch.setattr(
        "app.mcp_tools.get_firestore_client",
        lambda: _Db(
            {
                "session-1": {
                    "uid": "user-1",
                    "analysisTraceSnapshot": {
                        "capturedAt": "2026-03-31T13:55:00+00:00",
                        "agentRuntime": {
                            "candidate_agent": {"status": "completed"},
                            "job_agent": {"status": "completed"},
                        },
                        "knowledgeRetrieval": {"retrievalMode": "semantic", "quality": "good"},
                        "contextToolCalls": [{"toolName": "search_rubric_knowledge"}],
                        "turnEvidenceTimeline": {"answers": {"answer-1": {"answerId": "answer-1"}}},
                        "reportEvidence": {"toolCalls": [{"toolName": "search_rubric_knowledge"}]},
                    },
                }
            }
        ),
    )

    result = mcp_tools.get_session_trace("user-1", "session-1")

    assert result["sessionId"] == "session-1"
    assert result["hasTrace"] is True
    assert result["analysisTraceSnapshot"]["turnEvidenceTimeline"]["answers"]["answer-1"]["answerId"] == "answer-1"
    assert result["workflowSummary"]["currentStage"] == "report"
    assert result["workflowSummary"]["retrievalMode"] == "semantic"
    assert result["workflowSummary"]["contextToolCallCount"] == 1
    assert result["workflowSummary"]["reportToolCallCount"] == 1
    assert "Workflow com" in result["summary"]


def test_get_session_trace_hides_foreign_session(monkeypatch):
    monkeypatch.setattr(
        "app.mcp_tools.get_firestore_client",
        lambda: _Db(
            {
                "session-2": {
                    "uid": "other-user",
                    "analysisTraceSnapshot": {"capturedAt": "2026-03-31T13:55:00+00:00"},
                }
            }
        ),
    )

    result = mcp_tools.get_session_trace("user-1", "session-2")

    assert result["sessionId"] == "session-2"
    assert result["hasTrace"] is False
    assert result["analysisTraceSnapshot"] is None


def test_get_candidate_memory_returns_sanitized_payload(monkeypatch):
    monkeypatch.setattr(
        "app.mcp_tools.candidate_memory_repository.get_memory",
        lambda uid: {
            "userId": uid,
            "skillProgress": {"react": 0.7},
            "recurringGaps": ["observability", "system design"],
            "strongSkills": ["react", "typescript"],
            "behaviorProfile": {"summary": "Comunicacao clara."},
            "cultureFitSignals": {"summary": "Boa colaboracao."},
            "updatedAt": "2026-03-31T13:55:00+00:00",
        },
    )

    result = mcp_tools.get_candidate_memory("user-1")

    assert result["toolName"] == "get_candidate_memory"
    assert result["hasMemory"] is True
    assert result["memory"]["recurringGaps"] == ["observability", "system design"]
    assert result["memory"]["strongSkills"] == ["react", "typescript"]


def test_get_resume_analysis_returns_latest_record(monkeypatch):
    monkeypatch.setattr(
        "app.mcp_tools.resume_analysis_repository.list_resume_analyses",
        lambda user_id, limit, offset: {
            "items": [
                {
                    "id": "resume-1",
                    "fileName": "resume.pdf",
                    "source": "ai",
                    "aiProvider": "openai",
                    "aiModel": "gpt-5.4",
                    "promptVersion": "resume.v2",
                    "confidence": 0.88,
                    "createdAt": "2026-03-31T13:55:00+00:00",
                    "extraction": {
                        "technologies": ["React", "TypeScript"],
                        "experienceLevel": "mid",
                        "resumeSummary": "Frontend engineer.",
                    },
                    "match": {
                        "matchScore": 82,
                        "strongSkills": ["React"],
                        "weakSkills": ["Testing"],
                        "missingSkills": ["Observability"],
                    },
                }
            ]
        },
    )

    result = mcp_tools.get_resume_analysis("user-1")

    assert result["toolName"] == "get_resume_analysis"
    assert result["found"] is True
    assert result["analysis"]["id"] == "resume-1"
    assert result["analysis"]["technologies"] == ["React", "TypeScript"]
    assert result["analysis"]["match"]["missingSkills"] == ["Observability"]


def test_get_job_analysis_returns_latest_record(monkeypatch):
    monkeypatch.setattr(
        "app.mcp_tools.job_analysis_repository.list_job_analyses",
        lambda user_id, limit, offset: {
            "items": [
                {
                    "id": "job-1",
                    "source": "hybrid",
                    "aiProvider": "openai",
                    "aiModel": "gpt-5.4-mini",
                    "promptVersion": "job.v2",
                    "confidence": 0.79,
                    "createdAt": "2026-03-31T13:55:00+00:00",
                    "analysis": {
                        "roleTitleGuess": "Frontend Engineer",
                        "seniorityGuess": "mid",
                        "requiredSkills": ["React", "TypeScript"],
                        "interviewFocus": ["performance", "observability"],
                    },
                    "gap": {"matchScore": 76, "missingSkills": ["Testing"]},
                }
            ]
        },
    )

    result = mcp_tools.get_job_analysis("user-1")

    assert result["toolName"] == "get_job_analysis"
    assert result["found"] is True
    assert result["analysis"]["roleTitleGuess"] == "Frontend Engineer"
    assert result["analysis"]["requiredSkills"] == ["React", "TypeScript"]
    assert result["analysis"]["gap"]["missingSkills"] == ["Testing"]


def test_search_rubric_knowledge_returns_versioned_payload():
    result = mcp_tools.search_rubric_knowledge(
        track="frontend",
        seniority="mid",
        stacks=["React", "TypeScript"],
        question="Como voce monitora o frontend em producao?",
    )

    assert result["toolName"] == "search_rubric_knowledge"
    assert result["contractVersion"] == "mcp.devinterview.v1"
    assert "focus" in result and isinstance(result["focus"], list)
    assert "goodSignals" in result and isinstance(result["goodSignals"], list)
