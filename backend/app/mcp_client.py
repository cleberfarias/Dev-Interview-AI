from __future__ import annotations

import inspect
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import anyio
import httpx
from .request_context import append_tool_call

try:
    from mcp.client.streamable_http import streamablehttp_client as _streamable_http_client
except Exception:
    try:
        from mcp.client.streamable_http import streamable_http_client as _streamable_http_client
    except Exception:
        _streamable_http_client = None

try:
    from mcp import ClientSession
except Exception:
    try:
        from mcp.client.session import ClientSession
    except Exception:
        ClientSession = None

logger = logging.getLogger("uvicorn.error")
_mcp_sdk_missing_warned = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stringify(value: Any, limit: int = 160) -> str:
    text = " ".join(str(value or "").strip().split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _truncate_arguments(value: Any, depth: int = 0) -> Any:
    if depth >= 2:
        if isinstance(value, list):
            return [str(item) for item in value[:4]]
        if isinstance(value, dict):
            return {str(key): _stringify(val, limit=60) for key, val in list(value.items())[:4]}
        return _stringify(value, limit=60)
    if isinstance(value, dict):
        return {
            str(key): _truncate_arguments(val, depth + 1)
            for key, val in list(value.items())[:6]
        }
    if isinstance(value, list):
        return [_truncate_arguments(item, depth + 1) for item in value[:6]]
    if isinstance(value, str):
        return _stringify(value, limit=80)
    return value


def _tool_status(result: Any) -> str:
    if result is None:
        return "error"
    if isinstance(result, dict):
        if result.get("hasTrace") is False or result.get("hasMemory") is False or result.get("found") is False:
            return "empty"
        if result.get("ok") is False:
            return "error"
        return "ready" if result else "empty"
    if isinstance(result, list):
        return "ready" if result else "empty"
    return "ready" if result else "empty"


def _tool_summary(name: str, result: Any, status: str) -> str:
    if isinstance(result, dict):
        for value in (
            result.get("summary"),
            (result.get("memory") or {}).get("summary") if isinstance(result.get("memory"), dict) else None,
            (result.get("analysis") or {}).get("summary") if isinstance(result.get("analysis"), dict) else None,
        ):
            if isinstance(value, str) and value.strip():
                return _stringify(value)
        if result.get("hasTrace") is True:
            return "Trace da sessao pronto para auditoria."
        if result.get("hasTrace") is False:
            return "Nenhum trace encontrado para a sessao."
        if result.get("hasMemory") is False:
            return "Nenhuma memoria consolidada encontrada."
        if result.get("found") is False:
            return "Nenhum dado encontrado para a tool."
        focus = result.get("focus")
        if isinstance(focus, list) and focus:
            return f"{len(focus)} foco(s) recuperado(s) pela rubrica."
    if isinstance(result, list):
        return f"{len(result)} item(ns) retornado(s)."
    if isinstance(result, str) and result.strip():
        return _stringify(result)
    if status == "error":
        return f"Falha ao executar {name}."
    return f"{name} concluida sem dados adicionais."


def _record_tool_call(name: str, arguments: Dict[str, Any], result: Any, transport: str) -> None:
    status = _tool_status(result)
    contract_version = result.get("contractVersion") if isinstance(result, dict) else None
    append_tool_call(
        {
            "toolName": name,
            "contractVersion": contract_version if isinstance(contract_version, str) else None,
            "transport": transport,
            "status": status,
            "calledAt": _now_iso(),
            "arguments": _truncate_arguments(arguments),
            "summary": _tool_summary(name, result, status),
        }
    )


def _call_tool_local(name: str, arguments: Dict[str, Any]) -> tuple[Optional[Any], str]:
    try:
        from . import mcp_tools

        handlers = {
            "get_user_profile": mcp_tools.get_user_profile,
            "get_recent_interviews": mcp_tools.get_recent_interviews,
            "get_session_trace": mcp_tools.get_session_trace,
            "get_candidate_memory": mcp_tools.get_candidate_memory,
            "get_resume_analysis": mcp_tools.get_resume_analysis,
            "get_job_analysis": mcp_tools.get_job_analysis,
            "get_rubric": mcp_tools.get_rubric,
            "search_rubric_knowledge": mcp_tools.search_rubric_knowledge,
        }
        handler = handlers.get(name)
        if handler is None:
            return None, "local"
        return handler(**arguments), "local"
    except Exception:
        logger.exception("MCP local fallback failed: %s", name)
        return None, "local"


def _mcp_server_url() -> Optional[str]:
    url = (os.environ.get("MCP_SERVER_URL") or "").strip()
    return url or None


def _mcp_timeout_seconds() -> float:
    raw = (os.environ.get("MCP_HTTP_TIMEOUT") or "").strip()
    if not raw:
        return 5.0
    try:
        return float(raw)
    except Exception:
        return 5.0


def _build_headers(auth_token: Optional[str]) -> Dict[str, str]:
    if not auth_token:
        return {}
    return {"Authorization": f"Bearer {auth_token}"}


def _try_json(text: str) -> Optional[Any]:
    try:
        return json.loads(text)
    except Exception:
        return None


def _extract_tool_result(result: Any) -> Optional[Any]:
    try:
        if getattr(result, "isError", False):
            return None

        structured = getattr(result, "structuredContent", None)
        if structured is not None:
            return structured

        if isinstance(result, dict):
            if "structuredContent" in result:
                return result.get("structuredContent")
            if "structured_content" in result:
                return result.get("structured_content")

        content = getattr(result, "content", None)
        if isinstance(result, dict):
            content = result.get("content")

        if isinstance(content, list):
            text = "".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict)
            ).strip()
            if text:
                return _try_json(text) or text
        elif isinstance(content, str):
            return _try_json(content) or content
    except Exception:
        logger.exception("MCP client failed to parse tool result")
    return None


async def _call_tool_async(name: str, arguments: Dict[str, Any], auth_token: Optional[str]) -> tuple[Optional[Any], str]:
    global _mcp_sdk_missing_warned
    if _streamable_http_client is None or ClientSession is None:
        if not _mcp_sdk_missing_warned:
            logger.warning("MCP SDK not installed; MCP calls are disabled")
            _mcp_sdk_missing_warned = True
        return _call_tool_local(name, arguments)

    url = _mcp_server_url()
    if not url:
        logger.info("MCP_SERVER_URL not set; skipping MCP call for %s", name)
        return _call_tool_local(name, arguments)

    headers = _build_headers(auth_token)
    timeout = _mcp_timeout_seconds()

    try:
        sig = inspect.signature(_streamable_http_client)
        params = sig.parameters
    except Exception:
        params = {}

    async def _run_session(stream_tuple):
        read_stream = stream_tuple[0]
        write_stream = stream_tuple[1]
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
            if getattr(result, "isError", False):
                logger.warning("MCP tool error: %s", name)
                return None, "http"
            payload = _extract_tool_result(result)
            return payload, "http"

    kwargs: Dict[str, Any] = {}
    if "headers" in params:
        kwargs["headers"] = headers
    if "timeout" in params:
        kwargs["timeout"] = timeout
    if "read_timeout" in params:
        kwargs["read_timeout"] = max(timeout, 30.0)

    if "client" in params or "httpx_client" in params or "httpx_client_factory" in params:
        async with httpx.AsyncClient(headers=headers, timeout=timeout) as http_client:
            if "client" in params:
                kwargs["client"] = http_client
            elif "httpx_client" in params:
                kwargs["httpx_client"] = http_client
            elif "httpx_client_factory" in params:
                kwargs["httpx_client_factory"] = lambda: http_client
            async with _streamable_http_client(url, **kwargs) as stream_tuple:
                return await _run_session(stream_tuple)

    async with _streamable_http_client(url, **kwargs) as stream_tuple:
        return await _run_session(stream_tuple)


def _call_tool_sync(name: str, arguments: Dict[str, Any], auth_token: Optional[str]) -> Optional[Any]:
    try:
        result, transport = anyio.run(_call_tool_async, name, arguments, auth_token)
    except Exception:
        logger.exception("MCP client call failed: %s", name)
        result, transport = _call_tool_local(name, arguments)
    _record_tool_call(name, arguments, result, transport=transport)
    return result


def get_user_profile(uid: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync("get_user_profile", {"uid": uid}, auth_token)
    return result if isinstance(result, dict) else {}


def get_recent_interviews(uid: str, limit: int = 5, auth_token: Optional[str] = None) -> List[Dict[str, Any]]:
    result = _call_tool_sync("get_recent_interviews", {"uid": uid, "limit": limit}, auth_token)
    return result if isinstance(result, list) else []


def get_session_trace(uid: str, session_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync(
        "get_session_trace",
        {"uid": uid, "session_id": session_id},
        auth_token,
    )
    return result if isinstance(result, dict) else {}


def get_candidate_memory(uid: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync("get_candidate_memory", {"uid": uid}, auth_token)
    return result if isinstance(result, dict) else {}


def get_resume_analysis(uid: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync("get_resume_analysis", {"uid": uid}, auth_token)
    return result if isinstance(result, dict) else {}


def get_job_analysis(uid: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync("get_job_analysis", {"uid": uid}, auth_token)
    return result if isinstance(result, dict) else {}


def search_rubric_knowledge(
    track: str,
    seniority: str,
    stacks: List[str],
    question: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    result = _call_tool_sync(
        "search_rubric_knowledge",
        {"track": track, "seniority": seniority, "stacks": stacks, "question": question},
        auth_token,
    )
    return result if isinstance(result, dict) else {}


def get_rubric(track: str, seniority: str, stacks: List[str], question: Optional[str] = None, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync(
        "get_rubric",
        {"track": track, "seniority": seniority, "stacks": stacks, "question": question},
        auth_token,
    )
    return result if isinstance(result, dict) else {}
