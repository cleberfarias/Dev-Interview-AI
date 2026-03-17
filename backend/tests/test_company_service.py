from fastapi import HTTPException

from app.schemas.company import CompanyCreateRequest, CompanyMembershipUpsertRequest
from app.services import company_service


def test_create_company_creates_admin_membership(monkeypatch):
    captured = {}

    def _fake_upsert_company(company_id, data, merge=True):
        captured["company_id"] = company_id
        captured["company"] = data
        return data

    def _fake_upsert_membership(company_id, user_id, data, merge=True):
        captured["membership"] = data
        return data

    monkeypatch.setattr("app.services.company_service.company_repository.upsert_company", _fake_upsert_company)
    monkeypatch.setattr("app.services.company_service.company_repository.upsert_membership", _fake_upsert_membership)

    result = company_service.create_company(
        {"uid": "user-1"},
        CompanyCreateRequest(name="Empresa X", plan="business"),
    )

    assert captured["company_id"].startswith("cmp_")
    assert captured["company"]["name"] == "Empresa X"
    assert captured["membership"]["role"] == "admin"
    assert result.company.name == "Empresa X"
    assert result.membership.companyId == result.company.id


def test_list_user_companies_joins_membership_and_company(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_service.company_repository.list_user_memberships",
        lambda user_id: [
            {
                "userId": user_id,
                "companyId": "cmp_1",
                "role": "recruiter",
                "createdAt": "2026-03-17T00:00:00+00:00",
            }
        ],
    )
    monkeypatch.setattr(
        "app.services.company_service.company_repository.get_company",
        lambda company_id: {
            "id": company_id,
            "name": "Empresa X",
            "plan": "business",
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    result = company_service.list_user_companies({"uid": "user-1"})
    assert len(result.items) == 1
    assert result.items[0].company.id == "cmp_1"
    assert result.items[0].membership.role == "recruiter"


def test_get_company_access_context_enforces_membership_and_role(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_service.company_repository.get_company",
        lambda company_id: {
            "id": company_id,
            "name": "Empresa X",
            "plan": "business",
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )
    monkeypatch.setattr(
        "app.services.company_service.company_repository.get_membership",
        lambda company_id, user_id: {
            "userId": user_id,
            "companyId": company_id,
            "role": "viewer",
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    try:
        company_service.get_company_access_context(
            user={"uid": "user-1"},
            company_id="cmp_1",
            required_roles={"admin"},
        )
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 403


def test_upsert_company_member_requires_admin(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_service.get_company_access_context",
        lambda **kwargs: type(
            "Access",
            (),
            {
                "membership": type("Membership", (), {"userId": "admin-user"})(),
            },
        )(),
    )
    monkeypatch.setattr(
        "app.services.company_service.company_repository.get_membership",
        lambda company_id, user_id: None,
    )

    captured = {}

    def _fake_upsert(company_id, user_id, data, merge=True):
        captured["data"] = data
        return data

    monkeypatch.setattr("app.services.company_service.company_repository.upsert_membership", _fake_upsert)

    result = company_service.upsert_company_member(
        actor_user={"uid": "admin-user"},
        company_id="cmp_1",
        target_user_id="user-2",
        payload=CompanyMembershipUpsertRequest(role="viewer"),
    )

    assert captured["data"]["role"] == "viewer"
    assert result.userId == "user-2"


def test_upsert_company_member_blocks_self_demotion(monkeypatch):
    monkeypatch.setattr(
        "app.services.company_service.get_company_access_context",
        lambda **kwargs: type(
            "Access",
            (),
            {
                "membership": type("Membership", (), {"userId": "admin-user"})(),
            },
        )(),
    )

    try:
        company_service.upsert_company_member(
            actor_user={"uid": "admin-user"},
            company_id="cmp_1",
            target_user_id="admin-user",
            payload=CompanyMembershipUpsertRequest(role="viewer"),
        )
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
