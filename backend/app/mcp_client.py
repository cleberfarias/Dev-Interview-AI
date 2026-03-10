from __future__ import annotations

import inspect
import json
import logging
import os
from typing import Any, Dict, List, Optional

import anyio
import httpx

try:
    from mcp.client.streamable_http import streamablehttp_client as _streamable_http_client
except Exception:
    from mcp.client.streamable_http import streamable_http_client as _streamable_http_client

try:
    from mcp import ClientSession
except Exception:
    from mcp.client.session import ClientSession

logger = logging.getLogger("uvicorn.error")


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


async def _call_tool_async(name: str, arguments: Dict[str, Any], auth_token: Optional[str]) -> Optional[Any]:
    url = _mcp_server_url()
    if not url:
        logger.info("MCP_SERVER_URL not set; skipping MCP call for %s", name)
        return None

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
                return None
            return _extract_tool_result(result)

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
        return anyio.run(_call_tool_async, name, arguments, auth_token)
    except Exception:
        logger.exception("MCP client call failed: %s", name)
        return None


def get_user_profile(uid: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync("get_user_profile", {"uid": uid}, auth_token)
    return result if isinstance(result, dict) else {}


def get_recent_interviews(uid: str, limit: int = 5, auth_token: Optional[str] = None) -> List[Dict[str, Any]]:
    result = _call_tool_sync("get_recent_interviews", {"uid": uid, "limit": limit}, auth_token)
    return result if isinstance(result, list) else []


def get_rubric(track: str, seniority: str, stacks: List[str], question: Optional[str] = None, auth_token: Optional[str] = None) -> Dict[str, Any]:
    result = _call_tool_sync(
        "get_rubric",
        {"track": track, "seniority": seniority, "stacks": stacks, "question": question},
        auth_token,
    )
    return result if isinstance(result, dict) else {}
