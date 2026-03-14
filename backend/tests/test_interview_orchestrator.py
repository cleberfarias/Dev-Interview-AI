from app.schemas import InterviewConfig
from app.services import interview_orchestrator


def _config() -> InterviewConfig:
    return InterviewConfig(
        uiLanguage="pt-BR",
        interviewLanguage="pt-BR",
        track="backend",
        seniority="mid",
        stacks=["python", "fastapi"],
        style="friendly",
        duration=15,
        plan="free",
        jobDescription="Backend role with APIs",
    )


def test_build_context_runs_candidate_job_and_match_agents(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.candidate_profile_service.get_candidate_profile",
        lambda user: type("ProfileObj", (), {"model_dump": lambda self: {"resumeSummary": "Python", "jobDescription": "API"}})(),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.candidate_agent.run",
        lambda **kwargs: {"skills": ["python"], "seniority": "mid", "summary": "Candidate"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.job_agent.run",
        lambda **kwargs: {"requiredSkills": ["python"], "roleTitleGuess": "Backend Engineer"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.match_agent.run",
        lambda **kwargs: {"matchScore": 80},
    )

    result = interview_orchestrator.build_context(user={"uid": "u1"}, config=_config())
    assert result["candidate"]["skills"] == ["python"]
    assert result["job"]["roleTitleGuess"] == "Backend Engineer"
    assert result["match"]["matchScore"] == 80


def test_run_turn_returns_evaluation_coach_and_next_question(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.evaluator_agent.run_text",
        lambda **kwargs: {"scores": {"technical": 8}, "strengths": ["clear"], "improvements": ["detail"]},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.coach_agent.run",
        lambda **kwargs: {"tips": ["Use concrete examples"]},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.interviewer_agent.run",
        lambda **kwargs: {"shouldFinish": False, "question": {"prompt": "Next?"}},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.avatar_controller.generate_avatar_response",
        lambda **kwargs: {
            "audio": "ZmFrZS1hdWRpbw==",
            "mimeType": "audio/mpeg",
            "lipsync": {"frames": [{"time": 0.1, "viseme": "A"}], "durationMs": 1200},
            "emotion": "neutral",
            "ttsProvider": "openai",
            "render": {"state": "speaking", "facialPreset": "neutral", "intensity": 0.5, "meta": {}},
        },
    )

    result = interview_orchestrator.run_turn(
        user={"uid": "u1"},
        config=_config(),
        history=[],
        question="Tell me about API design",
        transcript="I usually start from constraints.",
        remaining_seconds=600,
    )
    assert "evaluation" in result
    assert "coach" in result
    assert result["nextQuestion"]["shouldFinish"] is False
    assert result["avatar"]["ttsProvider"] == "openai"


def test_finalize_returns_report_and_study_plan(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.report_agent.run",
        lambda **kwargs: {"overallScore": 8.2, "plan7Days": [{"day": 1, "task": "Practice APIs"}]},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.study_plan_agent.run",
        lambda **kwargs: {"priorityTopics": ["APIs"], "weeklyPlan": [{"day": 1, "task": "Practice APIs"}]},
    )

    result = interview_orchestrator.finalize(user={"uid": "u1"}, config=_config(), history=[])
    assert result["report"]["overallScore"] == 8.2
    assert result["studyPlan"]["priorityTopics"] == ["APIs"]
