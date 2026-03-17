from fastapi import HTTPException

from app.services import candidate_invite_service


def _auth_user():
    return {"uid": "company-user", "email": "company@example.com"}


def test_create_invite_valid(monkeypatch):
    user = _auth_user()

    # mock company access check
    monkeypatch.setattr("app.services.company_service.get_company_access_context", lambda **kwargs: True)

    # mock repository upsert
    saved = None

    def _upsert(invite_id, data, merge=True):
        nonlocal saved
        saved = dict(data)
        saved.setdefault("id", invite_id)
        return saved

    monkeypatch.setattr("app.repositories.candidate_invite_repository.upsert_invite", _upsert)

    payload = type("P", (), {"templateId": "tpl_1", "candidateName": "João", "candidateEmail": "joao@example.com"})()
    result = candidate_invite_service.create_invite(user=user, company_id="cmp_1", payload=payload)
    assert result.companyId == "cmp_1"
    assert result.templateId == "tpl_1"
    assert result.candidateEmail == "joao@example.com"


def test_get_invite_by_token_not_found(monkeypatch):
    monkeypatch.setattr("app.repositories.candidate_invite_repository.get_invite_by_token", lambda token: None)
    assert candidate_invite_service.get_invite_by_token("nope") is None
