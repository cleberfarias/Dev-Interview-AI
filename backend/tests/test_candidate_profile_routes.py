from fastapi.testclient import TestClient

from app.main import app
from app.firebase_admin import get_current_user


def _auth_user():
    return {
        "uid": "profile-user",
        "email": "profile@example.com",
        "name": "Profile User",
        "picture": None,
        "token": "test-token",
    }


def test_get_candidate_profile_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_profile.candidate_profile_service.get_candidate_profile",
        lambda user: {
            "userId": user["uid"],
            "targetRole": "Backend Engineer",
            "experienceLevel": "mid",
            "primarySkills": ["python"],
            "weakSkills": ["kubernetes"],
            "resumeSummary": "Resumo",
            "jobDescription": "Descricao da vaga",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "updatedAt": "2024-01-02T00:00:00+00:00",
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/profile/candidate")
        assert resp.status_code == 200
        assert resp.json()["userId"] == "profile-user"
    finally:
        app.dependency_overrides = {}


def test_put_candidate_profile_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user

    def _fake_upsert(user, payload):
        return {
            "userId": user["uid"],
            "targetRole": payload.targetRole,
            "experienceLevel": payload.experienceLevel,
            "primarySkills": payload.primarySkills,
            "weakSkills": payload.weakSkills,
            "resumeSummary": payload.resumeSummary,
            "jobDescription": payload.jobDescription,
            "createdAt": "2024-01-01T00:00:00+00:00",
            "updatedAt": "2024-01-03T00:00:00+00:00",
        }

    monkeypatch.setattr(
        "app.api.routes_profile.candidate_profile_service.upsert_candidate_profile",
        _fake_upsert,
    )

    try:
        client = TestClient(app)
        body = {
            "targetRole": "Backend Engineer",
            "experienceLevel": "mid",
            "primarySkills": ["python", "fastapi"],
            "weakSkills": ["kubernetes"],
            "resumeSummary": "Resumo",
            "jobDescription": "Descricao da vaga",
        }
        resp = client.put("/profile/candidate", json=body)
        assert resp.status_code == 200
        assert resp.json()["targetRole"] == "Backend Engineer"
    finally:
        app.dependency_overrides = {}


def test_patch_me_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user

    def _fake_update_me(user, payload):
        return {
            "uid": user["uid"],
            "name": payload.name,
            "email": user["email"],
            "avatar": None,
            "credits": 3,
            "interviews": [],
        }

    monkeypatch.setattr(
        "app.api.routes_profile.profile_service.update_me",
        _fake_update_me,
    )

    try:
        client = TestClient(app)
        resp = client.patch("/me", json={"name": "Cleber Silva"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["uid"] == "profile-user"
        assert data["name"] == "Cleber Silva"
    finally:
        app.dependency_overrides = {}


def test_complete_tour_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user

    def _fake_complete_tour(user, tour_id):
        return {
            "uid": user["uid"],
            "name": user["name"],
            "email": user["email"],
            "avatar": None,
            "credits": 3,
            "interviews": [],
            "tourCompletions": {tour_id: "2026-04-16T12:00:00+00:00"},
        }

    monkeypatch.setattr(
        "app.api.routes_profile.profile_service.complete_tour",
        _fake_complete_tour,
    )

    try:
        client = TestClient(app)
        resp = client.patch("/me/tours/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tourCompletions"]["dashboard"] == "2026-04-16T12:00:00+00:00"
    finally:
        app.dependency_overrides = {}


def test_complete_tour_route_rejects_unknown_tour():
    app.dependency_overrides[get_current_user] = _auth_user

    try:
        client = TestClient(app)
        resp = client.patch("/me/tours/unknown")
        assert resp.status_code == 400
    finally:
        app.dependency_overrides = {}


def test_get_candidate_profile_audit_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_profile.candidate_profile_service.list_candidate_profile_audit",
        lambda user, limit, offset: {
            "items": [
                {
                    "kind": "resume",
                    "source": "ai",
                    "aiProvider": "openai",
                    "aiModel": "gpt-4o-mini",
                    "createdAt": "2026-03-11T00:00:00+00:00",
                }
            ],
            "total": 1,
            "offset": offset,
            "limit": limit,
            "hasMore": False,
            "nextOffset": None,
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/profile/candidate/audit?limit=10&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["kind"] == "resume"
    finally:
        app.dependency_overrides = {}


def test_get_candidate_resume_analyses_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_profile.candidate_profile_service.list_resume_analyses",
        lambda user, limit, offset: {
            "items": [
                {
                    "id": "resume-analysis-1",
                    "userId": user["uid"],
                    "fileName": "resume.pdf",
                    "source": "ai",
                    "extraction": {
                        "technologies": ["python"],
                        "experienceLevel": "mid",
                        "projects": [],
                        "companies": [],
                        "responsibilities": [],
                        "resumeSummary": "Resumo",
                    },
                    "createdAt": "2026-03-12T00:00:00+00:00",
                }
            ],
            "total": 1,
            "offset": offset,
            "limit": limit,
            "hasMore": False,
            "nextOffset": None,
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/profile/candidate/resume-analyses?limit=10&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == "resume-analysis-1"
    finally:
        app.dependency_overrides = {}


def test_get_candidate_job_analyses_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_profile.candidate_profile_service.list_job_analyses",
        lambda user, limit, offset: {
            "items": [
                {
                    "id": "job-analysis-1",
                    "userId": user["uid"],
                    "jobDescription": "Backend role",
                    "source": "hybrid",
                    "analysis": {
                        "roleTitleGuess": "Backend Engineer",
                        "seniorityGuess": "mid",
                        "requiredSkills": ["python"],
                        "responsibilities": [],
                        "softSkills": [],
                        "interviewFocus": [],
                    },
                    "createdAt": "2026-03-12T00:00:00+00:00",
                }
            ],
            "total": 1,
            "offset": offset,
            "limit": limit,
            "hasMore": False,
            "nextOffset": None,
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/profile/candidate/job-analyses?limit=10&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == "job-analysis-1"
    finally:
        app.dependency_overrides = {}
