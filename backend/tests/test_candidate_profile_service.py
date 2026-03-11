from app.schemas import CandidateProfileUpsertRequest
from app.services import candidate_profile_service


def test_get_candidate_profile_returns_default_when_missing(monkeypatch):
    monkeypatch.setattr(
        "app.services.candidate_profile_service.candidate_profile_repository.get_profile",
        lambda user_id: None,
    )
    result = candidate_profile_service.get_candidate_profile({"uid": "user-1"})
    assert result.userId == "user-1"
    assert result.primarySkills == []
    assert result.weakSkills == []
    assert result.analysisAudit == []
    assert result.lastResumeAnalysisTrace is None
    assert result.lastJobAnalysisTrace is None


def test_upsert_candidate_profile_keeps_created_at(monkeypatch):
    monkeypatch.setattr(
        "app.services.candidate_profile_service.candidate_profile_repository.get_profile",
        lambda user_id: {"userId": user_id, "createdAt": "2024-01-01T00:00:00+00:00"},
    )

    captured = {}

    def _fake_upsert(user_id, data, merge=True):
        captured["user_id"] = user_id
        captured["data"] = data
        return data

    monkeypatch.setattr(
        "app.services.candidate_profile_service.candidate_profile_repository.upsert_profile",
        _fake_upsert,
    )

    payload = CandidateProfileUpsertRequest(
        targetRole="Backend Engineer",
        experienceLevel="mid",
        primarySkills=["python", "fastapi"],
        weakSkills=["kubernetes"],
        resumeSummary="Resumo",
        jobDescription="Descricao da vaga",
    )
    result = candidate_profile_service.upsert_candidate_profile({"uid": "user-1"}, payload)

    assert captured["user_id"] == "user-1"
    assert captured["data"]["createdAt"] == "2024-01-01T00:00:00+00:00"
    assert captured["data"]["updatedAt"] is not None
    assert captured["data"]["jobDescription"] == "Descricao da vaga"
    assert result.userId == "user-1"
    assert result.targetRole == "Backend Engineer"


def test_list_candidate_profile_audit_returns_paginated_items(monkeypatch):
    monkeypatch.setattr(
        "app.services.candidate_profile_service.candidate_profile_repository.get_profile",
        lambda user_id: {
            "userId": user_id,
            "analysisAudit": [
                {"kind": "resume", "source": "ai", "createdAt": "2026-03-11T00:00:00+00:00"},
                {"kind": "job", "source": "heuristic", "createdAt": "2026-03-10T00:00:00+00:00"},
                {"kind": "resume", "source": "hybrid", "createdAt": "2026-03-09T00:00:00+00:00"},
            ],
        },
    )

    page = candidate_profile_service.list_candidate_profile_audit({"uid": "user-1"}, limit=2, offset=0)
    assert page.total == 3
    assert page.offset == 0
    assert page.limit == 2
    assert page.hasMore is True
    assert page.nextOffset == 2
    assert len(page.items) == 2

    page2 = candidate_profile_service.list_candidate_profile_audit({"uid": "user-1"}, limit=2, offset=2)
    assert page2.total == 3
    assert page2.offset == 2
    assert page2.hasMore is False
    assert page2.nextOffset is None
    assert len(page2.items) == 1
