from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from starlette.responses import JSONResponse

from mcp.server.fastmcp import FastMCP

from . import mcp_tools
from .firebase_admin import verify_bearer_token

USER_BOUND_TOOLS = {"get_user_profile", "get_recent_interviews"}


class MCPFirebaseAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = (headers.get("authorization") or "").strip()
        try:
            decoded = verify_bearer_token(auth)
        except Exception as e:
            detail = getattr(e, "detail", "Unauthorized")
            status = getattr(e, "status_code", 401)
            resp = JSONResponse({"detail": detail}, status_code=status)
            await resp(scope, receive, send)
            return

        uid = decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")
        if not uid:
            resp = JSONResponse({"detail": "Invalid token payload: missing uid"}, status_code=401)
            await resp(scope, receive, send)
            return

        body = await self._read_body(receive)
        if body:
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception:
                resp = JSONResponse({"detail": "Invalid JSON"}, status_code=400)
                await resp(scope, receive, send)
                return
            if not self._validate_tool_calls(payload, uid):
                resp = JSONResponse({"detail": "Forbidden: uid mismatch"}, status_code=403)
                await resp(scope, receive, send)
                return

        scope["mcp_user"] = {"uid": uid, "email": decoded.get("email")}

        body_sent = False

        async def receive_with_body():
            nonlocal body_sent
            if body_sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            body_sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, receive_with_body, send)

    async def _read_body(self, receive) -> bytes:
        body = b""
        more_body = True
        while more_body:
            message = await receive()
            if message.get("type") != "http.request":
                break
            body += message.get("body", b"")
            more_body = message.get("more_body", False)
        return body

    def _validate_tool_calls(self, payload: Any, uid: str) -> bool:
        def _check(obj: Any) -> bool:
            if not isinstance(obj, dict):
                return True
            if obj.get("method") != "tools/call":
                return True
            params = obj.get("params") or {}
            tool_name = params.get("name")
            if tool_name in USER_BOUND_TOOLS:
                args = params.get("arguments") or {}
                req_uid = args.get("uid")
                return bool(req_uid) and req_uid == uid
            return True

        if isinstance(payload, list):
            return all(_check(item) for item in payload)
        return _check(payload)


mcp = FastMCP("Dev Interview AI MCP", json_response=True)
mcp.settings.streamable_http_path = "/"


@mcp.tool()
def ping() -> Dict[str, Any]:
    """Health check for MCP server."""
    return {"ok": True}


@mcp.tool()
def get_user_profile(uid: str) -> Dict[str, Any]:
    """Fetch a sanitized user profile from Firestore."""
    return mcp_tools.get_user_profile(uid)


@mcp.tool()
def get_recent_interviews(uid: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch recent interview summaries for a user."""
    return mcp_tools.get_recent_interviews(uid=uid, limit=limit)


@mcp.tool()
def get_rubric(track: str, seniority: str, stacks: List[str], question: Optional[str] = None) -> Dict[str, Any]:
    """Return a lightweight evaluation rubric based on track and seniority."""
    return mcp_tools.get_rubric(track=track, seniority=seniority, stacks=stacks, question=question)


def get_mcp_app():
    app = mcp.streamable_http_app()
    return MCPFirebaseAuthMiddleware(app)
