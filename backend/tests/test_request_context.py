from app.request_context import append_tool_call, consume_tool_calls, peek_tool_calls, scoped_context


def test_tool_calls_can_be_collected_and_consumed_per_context():
    with scoped_context(request_id="req-1", user_id="user-1", session_id="sess-1", tool_calls=[]):
        append_tool_call(
            {
                "toolName": "search_rubric_knowledge",
                "status": "ready",
                "transport": "local",
            }
        )
        assert peek_tool_calls() == [
            {
                "toolName": "search_rubric_knowledge",
                "status": "ready",
                "transport": "local",
            }
        ]
        assert consume_tool_calls()[0]["toolName"] == "search_rubric_knowledge"
        assert peek_tool_calls() == []


def test_tool_calls_outside_scope_do_not_leak():
    assert peek_tool_calls() == []
