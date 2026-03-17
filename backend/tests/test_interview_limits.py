from app.schemas import InterviewConfig
from app.services import interview_core, session_service


def _config(duration: int = 25, plan: str = "pro") -> InterviewConfig:
    return InterviewConfig(
        uiLanguage="pt-BR",
        interviewLanguage="pt-BR",
        track="backend",
        seniority="mid",
        stacks=["python", "fastapi"],
        style="friendly",
        duration=duration,
        plan=plan,
        jobDescription=None,
    )


def test_interview_limits_are_fixed_to_ten_minutes_and_five_questions():
    config = _config()

    assert interview_core._max_minutes_for_plan(config.plan) == 10
    assert interview_core._clamp_duration_minutes(config) == 10
    assert interview_core._plan_question_bounds(30) == (5, 5)

    normalized = session_service._normalize_config(config)
    assert normalized.duration == 10


def test_parse_plan_payload_caps_questions_to_five():
    config = _config()
    payload = {
        "roleTitleGuess": "Backend Engineer",
        "seniorityGuess": "mid",
        "mustHaveSkills": ["python", "fastapi"],
        "blueprint": {"hr": 10, "technical": 60, "design": 20, "behavioral": 10},
        "questions": [
            {"id": f"q{index + 1}", "section": "technical", "difficulty": 3, "prompt": f"Pergunta {index + 1}"}
            for index in range(7)
        ],
    }

    plan = interview_core._parse_plan_payload(payload, config)

    assert plan is not None
    assert len(plan.questions) == 5
    assert [question.id for question in plan.questions] == ["q1", "q2", "q3", "q4", "q5"]
