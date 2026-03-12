import base64

from fastapi.testclient import TestClient

from app.main import app
from app.firebase_admin import get_current_user
from app.ai.router import AIResult


def _auth_user():
    return {
        "uid": "resume-user",
        "email": "resume@example.com",
        "name": "Resume User",
        "picture": None,
        "token": "test-token",
    }


def test_resume_analyze_txt_with_match(monkeypatch):
    recorded = {}
    persisted = {}
    profile_sync = {}
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: recorded.update(kwargs),
    )
    monkeypatch.setattr(
        "app.services.resume_service.resume_analysis_repository.create_resume_analysis",
        lambda data: (persisted.update(data) or {"id": "resume-analysis-1", **data}),
    )
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.get_profile",
        lambda user_id: {"userId": user_id, "createdAt": "2024-01-01T00:00:00+00:00"},
    )
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.upsert_profile",
        lambda user_id, data, merge=True: (profile_sync.update(data) or data),
    )
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        sample_resume = (
            "Senior Backend Engineer\n"
            "8 years of experience with Python, FastAPI, Docker, AWS and PostgreSQL.\n"
            "Built payment APIs and microservices for fintech products.\n"
            "Responsible for architecture and mentoring team members.\n"
        )
        sample_job = (
            "We need a backend engineer with Python, FastAPI, Docker, Kubernetes and PostgreSQL.\n"
        )
        body = {
            "fileName": "resume.txt",
            "fileBase64": base64.b64encode(sample_resume.encode("utf-8")).decode("utf-8"),
            "mimeType": "text/plain",
            "jobDescription": sample_job,
        }

        client = TestClient(app)
        resp = client.post("/resume/analyze", json=body)
        assert resp.status_code == 200

        data = resp.json()
        assert "python" in data["extraction"]["technologies"]
        assert "fastapi" in data["extraction"]["technologies"]
        assert data["match"] is not None
        assert "kubernetes" in data["match"]["missingSkills"]
        assert data["extractionTrace"]["source"] in {"heuristic", "ai", "hybrid"}
        assert recorded.get("user_id") == "resume-user"
        assert recorded.get("kind") == "resume"
        assert persisted.get("userId") == "resume-user"
        assert persisted.get("fileName") == "resume.txt"
        assert persisted.get("match", {}).get("matchScore") is not None
        assert profile_sync.get("lastResumeAnalysisId") == "resume-analysis-1"
        assert profile_sync.get("recentResumeAnalysisIds", [])[0] == "resume-analysis-1"
    finally:
        app.dependency_overrides = {}


def test_resume_analyze_rejects_unsupported_extension(monkeypatch):
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: kwargs,
    )
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        body = {
            "fileName": "resume.bin",
            "fileBase64": base64.b64encode(b"binary-data").decode("utf-8"),
            "mimeType": "application/octet-stream",
        }

        client = TestClient(app)
        resp = client.post("/resume/analyze", json=body)
        assert resp.status_code == 400
        assert "Unsupported resume format" in resp.json()["detail"]
    finally:
        app.dependency_overrides = {}


def test_resume_analyze_uses_ai_extraction_when_available(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    recorded = {}
    persisted = {}
    profile_sync = {}
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: recorded.update(kwargs),
    )
    monkeypatch.setattr(
        "app.services.resume_service.resume_analysis_repository.create_resume_analysis",
        lambda data: (persisted.update(data) or {"id": "resume-analysis-2", **data}),
    )
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.get_profile",
        lambda user_id: {"userId": user_id, "createdAt": "2024-01-01T00:00:00+00:00"},
    )
    monkeypatch.setattr(
        "app.services.resume_service.candidate_profile_repository.upsert_profile",
        lambda user_id, data, merge=True: (profile_sync.update(data) or data),
    )
    monkeypatch.setattr(
        "app.services.resume_service.ai_router.generate",
        lambda **kwargs: AIResult(
            output_text=(
                '{'
                '"technologies":["python","fastapi","postgresql"],'
                '"experienceLevel":"senior",'
                '"projects":["Built payment APIs"],'
                '"companies":["Fintech X"],'
                '"responsibilities":["Led backend architecture"],'
                '"resumeSummary":"Senior backend engineer focused on APIs."'
                '}'
            ),
            provider_used="openai",
            model_used="gpt-test",
            latency_ms=12,
            tokens_used=120,
        ),
    )
    try:
        sample_resume = (
            "Backend profile text with APIs and distributed systems.\n"
            "Worked with Python and FastAPI for years.\n"
        )
        body = {
            "fileName": "resume.txt",
            "fileBase64": base64.b64encode(sample_resume.encode("utf-8")).decode("utf-8"),
            "mimeType": "text/plain",
        }

        client = TestClient(app)
        resp = client.post("/resume/analyze", json=body)
        assert resp.status_code == 200

        data = resp.json()
        assert data["extraction"]["experienceLevel"] == "senior"
        assert "python" in data["extraction"]["technologies"]
        assert "fintech x" in [company.lower() for company in data["extraction"]["companies"]]
        assert data["extractionTrace"]["source"] in {"ai", "hybrid"}
        assert data["extractionTrace"]["aiProvider"] == "openai"
        assert data["extractionTrace"]["aiModel"] == "gpt-test"
        assert recorded.get("kind") == "resume"
        assert isinstance(recorded.get("trace"), dict)
        assert persisted.get("userId") == "resume-user"
        assert profile_sync.get("lastResumeAnalysisId") == "resume-analysis-2"
    finally:
        app.dependency_overrides = {}
