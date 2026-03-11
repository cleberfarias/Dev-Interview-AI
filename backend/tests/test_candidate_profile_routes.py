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
