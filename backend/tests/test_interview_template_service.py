from fastapi import HTTPException

from app.schemas.interview_template import InterviewTemplateCreateRequest, InterviewTemplateUpdateRequest
from app.services import interview_template_service


def test_create_template_requires_company_access_and_persists(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_template_service.company_service.get_company_access_context",
        lambda **kwargs: object(),
    )

    captured = {}

    def _fake_upsert(template_id, data, merge=True):
        captured["template_id"] = template_id
        captured["data"] = data
        return data

    monkeypatch.setattr(
        "app.services.interview_template_service.interview_template_repository.upsert_template",
        _fake_upsert,
    )

    result = interview_template_service.create_template(
        user={"uid": "user-1"},
        company_id="cmp_1",
        payload=InterviewTemplateCreateRequest(
            name="Frontend React Junior",
            seniority="junior",
            topics=["React", " TypeScript "],
            questionCount=6,
            timeLimit=20,
            difficultyLevel=3,
        ),
    )

    assert captured["template_id"].startswith("tpl_")
    assert captured["data"]["companyId"] == "cmp_1"
    assert captured["data"]["topics"] == ["React", "TypeScript"]
    assert result.name == "Frontend React Junior"


def test_list_templates_returns_company_templates(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_template_service.company_service.get_company_access_context",
        lambda **kwargs: object(),
    )
    monkeypatch.setattr(
        "app.services.interview_template_service.interview_template_repository.list_templates",
        lambda company_id: [
            {
                "id": "tpl_1",
                "companyId": company_id,
                "name": "Frontend React Junior",
                "seniority": "junior",
                "topics": ["React"],
                "questionCount": 6,
                "timeLimit": 20,
                "difficultyLevel": 3,
                "createdAt": "2026-03-17T00:00:00+00:00",
            }
        ],
    )

    result = interview_template_service.list_templates(user={"uid": "user-1"}, company_id="cmp_1")
    assert len(result.items) == 1
    assert result.items[0].id == "tpl_1"


def test_update_template_keeps_existing_values_when_not_provided(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_template_service.company_service.get_company_access_context",
        lambda **kwargs: object(),
    )
    monkeypatch.setattr(
        "app.services.interview_template_service.interview_template_repository.get_template",
        lambda template_id: {
            "id": template_id,
            "companyId": "cmp_1",
            "name": "Original",
            "seniority": "mid",
            "topics": ["React"],
            "questionCount": 6,
            "timeLimit": 20,
            "difficultyLevel": 3,
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    captured = {}

    def _fake_upsert(template_id, data, merge=True):
        captured["data"] = data
        return {
            "id": template_id,
            "createdAt": "2026-03-17T00:00:00+00:00",
            **data,
        }

    monkeypatch.setattr(
        "app.services.interview_template_service.interview_template_repository.upsert_template",
        _fake_upsert,
    )

    result = interview_template_service.update_template(
        user={"uid": "user-1"},
        company_id="cmp_1",
        template_id="tpl_1",
        payload=InterviewTemplateUpdateRequest(name="Atualizado"),
    )

    assert captured["data"]["name"] == "Atualizado"
    assert captured["data"]["seniority"] == "mid"
    assert result.name == "Atualizado"


def test_delete_template_raises_when_foreign_company(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_template_service.company_service.get_company_access_context",
        lambda **kwargs: object(),
    )
    monkeypatch.setattr(
        "app.services.interview_template_service.interview_template_repository.get_template",
        lambda template_id: {
            "id": template_id,
            "companyId": "cmp_other",
            "name": "Original",
            "seniority": "mid",
            "topics": ["React"],
            "questionCount": 6,
            "timeLimit": 20,
            "difficultyLevel": 3,
            "createdAt": "2026-03-17T00:00:00+00:00",
        },
    )

    try:
        interview_template_service.delete_template(user={"uid": "user-1"}, company_id="cmp_1", template_id="tpl_1")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 404
