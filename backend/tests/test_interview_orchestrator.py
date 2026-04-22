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
        lambda user: type(
            "ProfileObj",
            (),
            {
                "model_dump": lambda self: {
                    "resumeSummary": "Python",
                    "jobDescription": "API",
                    "lastResumeAnalysisTrace": {
                        "source": "hybrid",
                        "aiProvider": "openai",
                        "aiModel": "gpt-5.4-mini",
                        "confidence": 0.84,
                    },
                    "lastJobAnalysisTrace": {
                        "source": "ai",
                        "aiProvider": "google",
                        "aiModel": "gemini-2.5-pro",
                        "confidence": 0.79,
                    },
                }
            },
        )(),
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
            "recurringGaps": ["system design"],
            "strongSkills": ["python"],
            "behaviorProfile": {"communicationStyle": "balanced"},
            "cultureFitSignals": {"overallAlignment": 7.2},
        },
    )
    monkeypatch.setattr(
        "app.knowledge_retrieval.user_repository.list_user_interviews",
        lambda uid, limit=3: [{"role": "Backend Engineer", "track": "backend", "style": "friendly", "score": 8.1}],
    )
    monkeypatch.setattr(
        "app.knowledge_retrieval.mcp_search_rubric_knowledge",
        lambda **kwargs: {"focus": ["api design", "observability"], "goodSignals": ["ownership"], "redFlags": []},
    )
    monkeypatch.setattr(
        "app.knowledge_retrieval.mcp_get_rubric",
        lambda **kwargs: {"focus": ["api design", "observability"], "good_signals": ["ownership"], "red_flags": []},
    )

    result = interview_orchestrator.build_context(user={"uid": "u1", "token": "token-1"}, config=_config())
    assert result["candidate"]["skills"] == ["python"]
    assert result["job"]["roleTitleGuess"] == "Backend Engineer"
    assert result["match"]["matchScore"] == 80
    assert result["agentRuntime"]["candidate_agent"]["source"] == "hybrid"
    assert result["agentRuntime"]["candidate_agent"]["aiProvider"] == "openai"
    assert result["agentRuntime"]["job_agent"]["source"] == "ai"
    assert result["agentRuntime"]["job_agent"]["aiModel"] == "gemini-2.5-pro"
    assert result["agentRuntime"]["match_agent"]["confidence"] >= 0.55
    assert result["agentRuntime"]["candidate_memory"]["status"] == "completed"
    assert result["knowledgeRetrieval"]["quality"] in {"moderate", "good", "strong"}
    assert result["knowledgeRetrieval"]["retrievalMode"] == "semantic"
    assert result["knowledgeRetrieval"]["indexStats"]["chunks"] >= 4
    assert any(source["sourceType"] == "rubric" for source in result["knowledgeRetrieval"]["sources"])
    assert result["behaviorProfile"]["communicationStyle"] == "balanced"
    assert result["cultureFitProfile"]["overallAlignment"] == 7.2


def test_build_context_exposes_skipped_memory_when_empty(monkeypatch):
    monkeypatch.setattr(
        "app.services.interview_orchestrator.candidate_profile_service.get_candidate_profile",
        lambda user: type("ProfileObj", (), {"model_dump": lambda self: {"resumeSummary": "", "jobDescription": ""}})(),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.candidate_agent.run",
        lambda **kwargs: {"skills": [], "seniority": "unknown", "summary": ""},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.job_agent.run",
        lambda **kwargs: {"requiredSkills": [], "roleTitleGuess": "Software Engineer"},
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.match_agent.run",
        lambda **kwargs: {"matchScore": 0},
    )
    monkeypatch.setattr("app.services.interview_orchestrator.memory_service.load_candidate_memory", lambda user_id: {})
    monkeypatch.setattr("app.knowledge_retrieval.user_repository.list_user_interviews", lambda uid, limit=3: [])
    monkeypatch.setattr("app.knowledge_retrieval.mcp_search_rubric_knowledge", lambda **kwargs: {})
    monkeypatch.setattr("app.knowledge_retrieval.mcp_get_rubric", lambda **kwargs: {})

    result = interview_orchestrator.build_context(user={"uid": "u1"}, config=_config())

    assert result["agentRuntime"]["candidate_memory"]["status"] == "skipped"
    assert result["agentRuntime"]["candidate_memory"]["source"] == "system"
    assert result["agentRuntime"]["candidate_agent"]["confidence"] <= 0.5
    assert result["knowledgeRetrieval"]["retrievalMode"] == "semantic"
    assert result["knowledgeRetrieval"]["quality"] in {"initial", "moderate"}


def test_run_turn_returns_evaluation_coach_and_next_question(monkeypatch):
    captured = {}

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
    monkeypatch.setattr(
        "app.services.interview_orchestrator.session_service.store_answer_communication_analysis",
        lambda session_id, answer_id, analysis, user: captured.setdefault("communication", analysis),
    )
    monkeypatch.setattr(
        "app.services.interview_orchestrator.session_service.store_answer_episode",
        lambda session_id, answer_id, episode, user: captured.setdefault("episode", episode),
    )
    result = interview_orchestrator.run_turn(
        user={"uid": "u1"},
        config=_config(),
        history=[],
        question="Tell me about API design",
        transcript="I usually start from constraints.",
        remaining_seconds=600,
        answer_id="answer-1",
        session_id="session-1",
    )
    assert "evaluation" in result
    assert "coach" in result
    assert result["nextQuestion"]["shouldFinish"] is False
    assert result["avatar"] is None
    assert result["communicationAnalysis"]["behaviorProfile"]["communicationStyle"] == "analitico-direto"
    assert result["communicationAnalysis"]["cultureFitSignals"]["overallAlignment"] == 7.1
    assert captured["episode"]["answerId"] == "answer-1"
    assert captured["episode"]["improvements"] == ["detail"]
    assert captured["episode"]["transcript"] == "I usually start from constraints."


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
