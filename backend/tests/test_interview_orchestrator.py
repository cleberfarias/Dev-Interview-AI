from app.schemas import (
    BehaviorProfile,
    CultureFitSignals,
    DiscReadinessSignals,
    InterviewConfig,
)
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
    monkeypatch.setattr(
        "app.services.interview_orchestrator.memory_service.load_candidate_memory",
        lambda user_id: {
            "behaviorProfile": {"communicationStyle": "balanced"},
            "cultureFitSignals": {"overallAlignment": 7.2},
        },
    )

    result = interview_orchestrator.build_context(user={"uid": "u1"}, config=_config())
    assert result["candidate"]["skills"] == ["python"]
    assert result["job"]["roleTitleGuess"] == "Backend Engineer"
    assert result["match"]["matchScore"] == 80
    assert result["behaviorProfile"]["communicationStyle"] == "balanced"
    assert result["cultureFitProfile"]["overallAlignment"] == 7.2


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
        "app.services.interview_orchestrator.candidate_profile_service.get_candidate_profile",
        lambda user: type("ProfileObj", (), {"model_dump": lambda self: {"primarySkills": ["python"], "jobDescription": "API"}})(),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.job_agent.run",
        lambda **kwargs: {"softSkills": ["ownership"], "roleTitleGuess": "Backend Engineer"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.match_agent.run",
        lambda **kwargs: {"matchScore": 80},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.behavior_agent.run",
        lambda **kwargs: BehaviorProfile(
            communicationStyle="analitico-direto",
            observedTraits=["objetividade"],
            summary="Resumo",
            discReadiness=DiscReadinessSignals(dominance=7, influence=6, steadiness=6, conscientiousness=8),
        ),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.culture_fit_agent.run",
        lambda **kwargs: CultureFitSignals(
            collaboration=7.1,
            ownership=7.4,
            adaptability=6.8,
            communicationFit=7.2,
            overallAlignment=7.1,
            supportingSignals=["ownership"],
            summary="Resumo",
        ),
    )
    result = interview_orchestrator.run_turn(
        user={"uid": "u1"},
        config=_config(),
        history=[],
        question="Tell me about API design",
        transcript="I usually start from constraints.",
        remaining_seconds=600,
        answer_id="answer-1",
    )
    assert "evaluation" in result
    assert "coach" in result
    assert result["nextQuestion"]["shouldFinish"] is False
    assert result["avatar"] is None
    assert result["communicationAnalysis"]["behaviorProfile"]["communicationStyle"] == "analitico-direto"
    assert result["communicationAnalysis"]["cultureFitSignals"]["overallAlignment"] == 7.1


def test_run_turn_can_inline_avatar_when_requested(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.evaluator_agent.run_text",
        lambda **kwargs: {"scores": {"technical": 8}, "strengths": ["clear"], "improvements": ["detail"], "transcript": "ok"},
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
        "app.services.interview_orchestrator.candidate_profile_service.get_candidate_profile",
        lambda user: type("ProfileObj", (), {"model_dump": lambda self: {"primarySkills": ["python"], "jobDescription": "API"}})(),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.job_agent.run",
        lambda **kwargs: {"softSkills": ["ownership"], "roleTitleGuess": "Backend Engineer"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.match_agent.run",
        lambda **kwargs: {"matchScore": 80},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.behavior_agent.run",
        lambda **kwargs: BehaviorProfile(
            communicationStyle="analitico-direto",
            observedTraits=["objetividade"],
            summary="Resumo",
            discReadiness=DiscReadinessSignals(dominance=7, influence=6, steadiness=6, conscientiousness=8),
        ),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.culture_fit_agent.run",
        lambda **kwargs: CultureFitSignals(
            collaboration=7.1,
            ownership=7.4,
            adaptability=6.8,
            communicationFit=7.2,
            overallAlignment=7.1,
            supportingSignals=["ownership"],
            summary="Resumo",
        ),
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
        answer_id="answer-inline-avatar",
        include_avatar=True,
    )

    assert result["avatar"]["ttsProvider"] == "openai"


def test_run_turn_hiring_mode_returns_empty_coach_payload(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.evaluator_agent.run_text",
        lambda **kwargs: {"scores": {"technical": 8}, "strengths": ["clear"], "improvements": ["detail"], "transcript": "ok"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.interviewer_agent.run",
        lambda **kwargs: {"shouldFinish": False, "question": {"prompt": "Next?"}},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.candidate_profile_service.get_candidate_profile",
        lambda user: type("ProfileObj", (), {"model_dump": lambda self: {"primarySkills": ["python"], "jobDescription": "API"}})(),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.job_agent.run",
        lambda **kwargs: {"softSkills": ["ownership"], "roleTitleGuess": "Backend Engineer"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.match_agent.run",
        lambda **kwargs: {"matchScore": 80},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.behavior_agent.run",
        lambda **kwargs: BehaviorProfile(
            communicationStyle="equilibrado-profissional",
            observedTraits=["consistencia"],
            summary="Resumo",
            discReadiness=DiscReadinessSignals(dominance=6, influence=6, steadiness=7, conscientiousness=7),
        ),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.culture_fit_agent.run",
        lambda **kwargs: CultureFitSignals(
            collaboration=6.8,
            ownership=7.0,
            adaptability=6.6,
            communicationFit=6.9,
            overallAlignment=6.8,
            supportingSignals=["ownership"],
            summary="Resumo",
        ),
    )
    monkeypatch.setattr("app.services.interview_orchestrator.avatar_controller.generate_avatar_response", lambda **kwargs: None)

    result = interview_orchestrator.run_turn(
        user={"uid": "u1"},
        config=_config(),
        history=[],
        question="Tell me about API design",
        transcript="I usually start from constraints.",
        remaining_seconds=600,
        answer_id="answer-2",
        interview_mode="hiring_assessment_mode",
    )

    assert result["coach"]["tips"] == []
    assert result["communicationAnalysis"]["mode"] == "hiring_assessment_mode"


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
