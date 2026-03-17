from fastapi.testclient import TestClient

from app.firebase_admin import get_current_user
from app.main import app


def _auth_user():
    return {
        "uid": "company-user",
        "email": "company@example.com",
        "name": "Company User",
        "picture": None,
        "token": "test-token",
    }


def test_create_template_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.interview_template_service.create_template",
        lambda user, company_id, payload: {
            "id": "tpl_1",
            "companyId": company_id,
            "name": payload.name,
            "seniority": payload.seniority,
            "topics": payload.topics,
            "questionCount": payload.questionCount,
            "timeLimit": payload.timeLimit,
            "difficultyLevel": payload.difficultyLevel,
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    try:
        client = TestClient(app)
        resp = client.post(
            "/company/cmp_1/templates",
            json={
                "name": "Frontend React Junior",
                "seniority": "junior",
                "topics": ["React", "JS"],
                "questionCount": 6,
                "timeLimit": 20,
                "difficultyLevel": 3,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["companyId"] == "cmp_1"
    finally:
        app.dependency_overrides = {}


def test_list_templates_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.interview_template_service.list_templates",
        lambda user, company_id: {
            "items": [
                {
                    "id": "tpl_1",
                    "companyId": company_id,
                    "name": "Frontend React Junior",
                    "seniority": "junior",
                    "topics": ["React", "JS"],
                    "questionCount": 6,
                    "timeLimit": 20,
                    "difficultyLevel": 3,
                    "createdAt": "2026-03-17T00:00:00+00:00",
                }
            ]
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/company/cmp_1/templates")
        assert resp.status_code == 200
        assert resp.json()["items"][0]["id"] == "tpl_1"
    finally:
        app.dependency_overrides = {}


def test_update_template_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.interview_template_service.update_template",
        lambda user, company_id, template_id, payload: {
            "id": template_id,
            "companyId": company_id,
            "name": payload.name or "Original",
            "seniority": "mid",
            "topics": ["React"],
            "questionCount": 6,
            "timeLimit": 20,
            "difficultyLevel": 3,
            "createdAt": "2026-03-17T00:00:00+00:00",
            "updatedAt": "2026-03-17T00:00:01+00:00",
        },
    )

    try:
        client = TestClient(app)
        resp = client.put("/company/cmp_1/templates/tpl_1", json={"name": "Atualizado"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Atualizado"
    finally:
        app.dependency_overrides = {}


def test_delete_template_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.interview_template_service.delete_template",
        lambda user, company_id, template_id: {"ok": True},
    )

    try:
        client = TestClient(app)
        resp = client.delete("/company/cmp_1/templates/tpl_1")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
    finally:
        app.dependency_overrides = {}
