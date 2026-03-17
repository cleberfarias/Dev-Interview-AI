from fastapi import HTTPException
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


def test_create_company_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.company_service.create_company",
        lambda user, payload: {
            "company": {
                "id": "cmp_1",
                "name": payload.name,
                "plan": payload.plan,
                "createdAt": "2026-03-17T00:00:00+00:00",
            },
            "membership": {
                "userId": user["uid"],
                "companyId": "cmp_1",
                "role": "admin",
                "createdAt": "2026-03-17T00:00:00+00:00",
            },
        },
    )

    try:
        client = TestClient(app)
        resp = client.post("/company", json={"name": "Empresa X", "plan": "business"})
        assert resp.status_code == 200
        assert resp.json()["company"]["name"] == "Empresa X"
        assert resp.json()["membership"]["role"] == "admin"
    finally:
        app.dependency_overrides = {}


def test_list_my_companies_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.company_service.list_user_companies",
        lambda user: {
            "items": [
                {
                    "company": {
                        "id": "cmp_1",
                        "name": "Empresa X",
                        "plan": "business",
                        "createdAt": "2026-03-17T00:00:00+00:00",
                    },
                    "membership": {
                        "userId": user["uid"],
                        "companyId": "cmp_1",
                        "role": "viewer",
                        "createdAt": "2026-03-17T00:00:00+00:00",
                    },
                }
            ]
        },
    )

    try:
        client = TestClient(app)
        resp = client.get("/company/mine")
        assert resp.status_code == 200
        assert resp.json()["items"][0]["membership"]["role"] == "viewer"
    finally:
        app.dependency_overrides = {}


def test_get_company_route_uses_company_access_dependency(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    seen = {}

    def _fake_access(*, user, company_id, required_roles=None):
        seen["company_id"] = company_id
        return {
            "company": {
                "id": company_id,
                "name": "Empresa X",
                "plan": "business",
                "createdAt": "2026-03-17T00:00:00+00:00",
            },
            "membership": {
                "userId": user["uid"],
                "companyId": company_id,
                "role": "admin",
                "createdAt": "2026-03-17T00:00:00+00:00",
            },
        }

    monkeypatch.setattr("app.middlewares.company_auth.company_service.get_company_access_context", _fake_access)

    try:
        client = TestClient(app)
        resp = client.get("/company/cmp_1")
        assert resp.status_code == 200
        assert seen["company_id"] == "cmp_1"
    finally:
        app.dependency_overrides = {}


def test_get_company_route_blocks_cross_company_access(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user

    def _deny(**kwargs):
        raise HTTPException(status_code=403, detail="Acesso negado para esta empresa")

    monkeypatch.setattr("app.middlewares.company_auth.company_service.get_company_access_context", _deny)

    try:
        client = TestClient(app)
        resp = client.get("/company/cmp_forbidden")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides = {}


def test_upsert_company_member_route(monkeypatch):
    app.dependency_overrides[get_current_user] = _auth_user
    monkeypatch.setattr(
        "app.api.routes_company.company_service.upsert_company_member",
        lambda actor_user, company_id, target_user_id, payload: {
            "userId": target_user_id,
            "companyId": company_id,
            "role": payload.role,
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    try:
        client = TestClient(app)
        resp = client.put("/company/cmp_1/members/user_2", json={"role": "recruiter"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "recruiter"
    finally:
        app.dependency_overrides = {}
