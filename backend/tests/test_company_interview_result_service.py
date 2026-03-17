from app.services import company_interview_result_service


def _auth_user():
    return {"uid": "company-user", "email": "company@example.com"}


def test_create_result_and_list(monkeypatch):
    user = _auth_user()

    # allow access
    monkeypatch.setattr("app.services.company_service.get_company_access_context", lambda **kwargs: True)

    saved = None

    def _upsert(result_id, data, merge=True):
        nonlocal saved
        saved = dict(data)
        saved.setdefault("id", result_id)
        return saved

    monkeypatch.setattr("app.repositories.company_interview_result_repository.upsert_result", _upsert)
    monkeypatch.setattr("app.repositories.company_interview_result_repository.list_results", lambda company_id, limit=200: [saved])

    payload = type("P", (), {
        "templateId": "tpl_1",
        "candidateName": "Maria",
        "technicalScore": 7.5,
        "communicationScore": 8.0,
        "behavioralScore": 7.0,
        "overallScore": 7.5,
        "recommendation": "Good",
    })()

    result = company_interview_result_service.create_result(user=user, company_id="cmp_1", payload=payload)
    assert result.companyId == "cmp_1"
    assert result.candidateName == "Maria"

    listing = company_interview_result_service.list_results(user=user, company_id="cmp_1")
    assert len(listing.items) >= 1
