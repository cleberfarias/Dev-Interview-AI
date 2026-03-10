import os

from app import main as main_module
from app.schemas import InterviewConfig


def _config():
    return InterviewConfig(
        uiLanguage="pt-BR",
        interviewLanguage="pt-BR",
        track="backend",
        seniority="mid",
        stacks=["python"],
        style="friendly",
        duration=20,
        plan="free",
        jobDescription=None,
    )


def test_plan_context_disabled_skips_mcp(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "false")

    def _boom(*args, **kwargs):
        raise AssertionError("MCP should not be called when disabled")

    monkeypatch.setattr(main_module, "mcp_get_recent_interviews", _boom)
    monkeypatch.setattr(main_module, "mcp_get_rubric", _boom)

    ctx = main_module._build_plan_context("user-1", _config(), auth_token="token")
    assert ctx == ""


def test_plan_context_enabled_includes_context(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "true")

    monkeypatch.setattr(
        main_module,
        "mcp_get_recent_interviews",
        lambda uid, limit=3, auth_token=None: [{"id": "1", "score": 7.5}],
    )
    monkeypatch.setattr(
        main_module,
        "mcp_get_rubric",
        lambda track, seniority, stacks, question=None, auth_token=None: {
            "focus": ["clarity"],
            "good_signals": ["structure"],
            "red_flags": ["vague"],
        },
    )

    ctx = main_module._build_plan_context("user-1", _config(), auth_token="token")
    assert "recent_interviews" in ctx
    assert "rubric" in ctx


def test_report_context_enabled_includes_context(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "true")

    monkeypatch.setattr(
        main_module,
        "mcp_get_recent_interviews",
        lambda uid, limit=5, auth_token=None: [{"id": "2", "score": 8.0}],
    )
    monkeypatch.setattr(
        main_module,
        "mcp_get_rubric",
        lambda track, seniority, stacks, question=None, auth_token=None: {
            "focus": ["tradeoffs"],
            "good_signals": ["assumptions"],
            "red_flags": ["no edge cases"],
        },
    )

    ctx = main_module._build_report_context("user-1", _config(), auth_token="token")
    assert "recent_interviews" in ctx
    assert "rubric" in ctx


def test_eval_prompt_includes_rubric_and_passes_token(monkeypatch):
    monkeypatch.setenv("MCP_CONTEXT_ENABLED", "true")
    seen = {"token": None}

    def _fake_rubric(track, seniority, stacks, question=None, auth_token=None):
        seen["token"] = auth_token
        return {
            "focus": ["clarity"],
            "good_signals": ["structure"],
            "red_flags": ["vague"],
        }

    monkeypatch.setattr(main_module, "mcp_get_rubric", _fake_rubric)

    prompt = main_module._build_eval_prompt(
        _config(),
        "Explique o que e uma API.",
        "Ana",
        auth_token="firebase-token",
    )

    assert "Rubrica de avaliacao" in prompt
    assert seen["token"] == "firebase-token"
