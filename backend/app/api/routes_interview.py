from __future__ import annotations

from fastapi import APIRouter

from ..services import interview_core

# Legacy compatibility module:
# official interview lifecycle lives in routes_orchestrator.py under /interview/*
router = APIRouter()

# Compatibility exports used by legacy tests/imports.
ai_router = interview_core.ai_router
mcp_get_recent_interviews = interview_core.mcp_get_recent_interviews
mcp_get_rubric = interview_core.mcp_get_rubric

