from fastapi.testclient import TestClient

from app.main import app
from app.firebase_admin import get_current_user
from app.ai.router import AIResult


def _auth_user():
    return {
        "uid": "jobs-user",
        "email": "jobs@example.com",
        "name": "Jobs User",
        "picture": None,
        "token": "test-token",
    }


def test_jobs_analyze_with_resume_gap(monkeypatch):
    recorded = {}
    monkeypatch.setattr(
        "app.services.jobs_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: recorded.update(kwargs),
    )
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        job_description = (
            "Senior Backend Engineer\n"
            "Requirements: Python, FastAPI, PostgreSQL, Docker, Kubernetes.\n"
            "You will design APIs, build microservices and maintain cloud infrastructure.\n"
            "Strong communication and collaboration are required.\n"
        )
        body = {
            "jobDescription": job_description,
            "resumeTechnologies": ["python", "fastapi", "docker"],
        }

        client = TestClient(app)
        resp = client.post("/jobs/analyze", json=body)
        assert resp.status_code == 200
        data = resp.json()

        assert data["analysis"]["seniorityGuess"] == "senior"
        assert "python" in data["analysis"]["requiredSkills"]
        assert data["gap"] is not None
        assert "kubernetes" in data["gap"]["missingSkills"]
        assert data["analysisTrace"]["source"] in {"heuristic", "ai", "hybrid"}
        assert recorded.get("user_id") == "jobs-user"
        assert recorded.get("kind") == "job"
    finally:
        app.dependency_overrides = {}


def test_jobs_analyze_requires_description(monkeypatch):
    monkeypatch.setattr(
        "app.services.jobs_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: kwargs,
    )
    app.dependency_overrides[get_current_user] = _auth_user
    try:
        client = TestClient(app)
        resp = client.post("/jobs/analyze", json={"jobDescription": "   "})
        assert resp.status_code == 400
        assert "jobDescription is required" in resp.json()["detail"]
    finally:
        app.dependency_overrides = {}


def test_jobs_analyze_uses_ai_analysis_when_available(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    recorded = {}
    monkeypatch.setattr(
        "app.services.jobs_service.candidate_profile_repository.record_analysis_trace",
        lambda **kwargs: recorded.update(kwargs),
    )
    monkeypatch.setattr(
        "app.services.jobs_service.ai_router.generate",
        lambda **kwargs: AIResult(
            output_text=(
                '{'
                '"roleTitleGuess":"Platform Engineer",'
                '"seniorityGuess":"mid",'
                '"requiredSkills":["python","kubernetes","terraform"],'
                '"responsibilities":["Build platform tooling"],'
                '"softSkills":["communication"],'
                '"interviewFocus":["Discuss infra trade-offs"]'
                '}'
            ),
            provider_used="openai",
            model_used="gpt-test",
            latency_ms=10,
            tokens_used=90,
        ),
    )
    try:
        body = {
            "jobDescription": "Hiring platform engineer to build tooling and infrastructure.",
            "resumeTechnologies": ["python"],
        }

        client = TestClient(app)
        resp = client.post("/jobs/analyze", json=body)
        assert resp.status_code == 200
        data = resp.json()

        assert data["analysis"]["roleTitleGuess"] == "Platform Engineer"
        assert data["analysis"]["seniorityGuess"] == "mid"
        assert "terraform" in data["analysis"]["requiredSkills"]
        assert data["gap"] is not None
        assert data["analysisTrace"]["source"] in {"ai", "hybrid"}
        assert data["analysisTrace"]["aiProvider"] == "openai"
        assert data["analysisTrace"]["aiModel"] == "gpt-test"
        assert recorded.get("kind") == "job"
        assert isinstance(recorded.get("trace"), dict)
    finally:
        app.dependency_overrides = {}
