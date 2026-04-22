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
    monkeypatch.setattr(main_module, "mcp_search_rubric_knowledge", _boom)
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
        "mcp_search_rubric_knowledge",
        lambda track, seniority, stacks, question=None, auth_token=None: {
            "focus": ["clarity"],
            "goodSignals": ["structure"],
            "redFlags": ["vague"],
        },
    )
    monkeypatch.setattr(
        main_module,
        "mcp_get_rubric",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("fallback not expected")),
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
        "mcp_search_rubric_knowledge",
        lambda track, seniority, stacks, question=None, auth_token=None: {
            "focus": ["tradeoffs"],
            "goodSignals": ["assumptions"],
            "redFlags": ["no edge cases"],
        },
    )
    monkeypatch.setattr(
        main_module,
        "mcp_get_rubric",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("fallback not expected")),
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
            "goodSignals": ["structure"],
            "redFlags": ["vague"],
        }

    monkeypatch.setattr(main_module, "mcp_search_rubric_knowledge", _fake_rubric)
    monkeypatch.setattr(
        main_module,
        "mcp_get_rubric",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("fallback not expected")),
    )

    prompt = main_module._build_eval_prompt(
        _config(),
        "Explique o que e uma API.",
        "Ana",
        auth_token="firebase-token",
    )

    assert "Rubrica de avaliacao" in prompt
    assert seen["token"] == "firebase-token"
