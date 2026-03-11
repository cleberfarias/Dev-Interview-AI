import os
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv

try:
    from .mcp_server import get_mcp_app, mcp
except Exception:
    mcp = None

    def get_mcp_app():
        fallback = FastAPI(title='MCP Unavailable')

        @fallback.get('/health')
        def _health():
            return {'ok': False, 'reason': 'mcp_dependency_missing'}

        return fallback
from .kiwify_webhook import router as kiwify_webhook_router
from .api import (
    routes_auth,
    routes_ai,
    routes_credits,
    routes_jobs,
    routes_live_coach,
    routes_profile,
    routes_reports,
    routes_resume,
    routes_sessions,
)
from .services import interview_core

# Load backend/.env when present (local dev)
_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
load_dotenv(_env_path)


class StripApiPrefixMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get('type') in {'http', 'websocket'}:
            path = scope.get('path', '')
            if path == '/api':
                scope['path'] = '/'
                scope['raw_path'] = b'/'
            elif path.startswith('/api/'):
                new_path = path[len('/api'):]
                scope['path'] = new_path
                scope['raw_path'] = new_path.encode('utf-8')
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if mcp is None:
        yield
        return
    async with mcp.session_manager.run():
        yield


app = FastAPI(title='Dev Interview AI API', version='1.0.0', lifespan=lifespan)
app.add_middleware(StripApiPrefixMiddleware)
logger = logging.getLogger('uvicorn.error')


@app.middleware('http')
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    logger.info('[%s] HTTP %s %s', request_id, request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception('[%s] Unhandled error', request_id)
        raise
    response.headers['x-request-id'] = request_id
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, 'request_id', 'unknown')
    logger.exception('[%s] Unhandled exception for %s %s', request_id, request.method, request.url.path)
    return PlainTextResponse(f'Internal Server Error (request_id={request_id})', status_code=500)


# Dev defaults for local ports. Can be overridden with CORS_ORIGINS.
cors_origins = os.environ.get(
    'CORS_ORIGINS',
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5000',
).split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# MCP server (Streamable HTTP transport)
app.mount('/mcp', get_mcp_app())

# App routes
app.include_router(routes_profile.router)
app.include_router(routes_auth.router)
app.include_router(routes_sessions.router)
app.include_router(routes_ai.router)
app.include_router(routes_reports.router)
app.include_router(routes_credits.router)
app.include_router(routes_jobs.router)
app.include_router(routes_resume.router)
app.include_router(routes_live_coach.router)
app.include_router(kiwify_webhook_router)


# Compatibility exports for tests/legacy imports from app.main
ai_router = interview_core.ai_router
mcp_get_recent_interviews = interview_core.mcp_get_recent_interviews
mcp_get_rubric = interview_core.mcp_get_rubric
_get_user_credits = interview_core._get_user_credits
_debit_credits = interview_core._debit_credits


def _mcp_get_recent_interviews_proxy(*args, **kwargs):
    return mcp_get_recent_interviews(*args, **kwargs)


def _mcp_get_rubric_proxy(*args, **kwargs):
    return mcp_get_rubric(*args, **kwargs)


def _get_user_credits_proxy(*args, **kwargs):
    return _get_user_credits(*args, **kwargs)


def _debit_credits_proxy(*args, **kwargs):
    return _debit_credits(*args, **kwargs)


interview_core.mcp_get_recent_interviews = _mcp_get_recent_interviews_proxy
interview_core.mcp_get_rubric = _mcp_get_rubric_proxy
interview_core._get_user_credits = _get_user_credits_proxy
interview_core._debit_credits = _debit_credits_proxy


def _safe_json_loads(text: str):
    return interview_core._safe_json_loads(text)


def _normalize_eval_payload(*args, **kwargs):
    return interview_core._normalize_eval_payload(*args, **kwargs)


def _build_plan_context(*args, **kwargs):
    return interview_core._build_plan_context(*args, **kwargs)


def _build_report_context(*args, **kwargs):
    return interview_core._build_report_context(*args, **kwargs)


def _build_eval_prompt(*args, **kwargs):
    return interview_core._build_eval_prompt(*args, **kwargs)
