from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import candidate_invite_service
from ..schemas import OrchestratorStartRequest, InterviewConfig
from ..services import interview_orchestrator

router = APIRouter()


@router.get("/public/invite/{token}")
def get_invite_public(token: str):
    invite = candidate_invite_service.get_invite_by_token(token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    # return a safe representation
    return {
        "id": invite.id,
        "companyId": invite.companyId,
        "templateId": invite.templateId,
        "candidateName": invite.candidateName,
        "candidateEmail": invite.candidateEmail,
        "interviewMode": invite.interviewMode,
    }


class StartInviteRequest(BaseModel):
    candidateName: str | None = None
    candidateLogin: str | None = None
    candidatePassword: str | None = None


@router.post("/public/invite/{token}/start")
def start_invite_interview(token: str, payload: StartInviteRequest | None = None):
    invite = candidate_invite_service.get_invite_by_token(token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    # if credentials were generated, require them
    if invite.candidateLogin:
        if not payload or not payload.candidateLogin or not payload.candidatePassword:
            raise HTTPException(status_code=400, detail="Credentials required")
        if not (payload.candidateLogin == invite.candidateLogin and payload.candidatePassword == invite.candidatePassword):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    # build a temporary user representation
    user = {
        "uid": f"invite_{invite.id}",
        "email": invite.candidateEmail,
        "name": (payload.candidateName or invite.candidateName),
        "token": None,
    }

    # fetch template and build a minimal InterviewConfig from template fields
    from ..repositories import interview_template_repository

    tpl = interview_template_repository.get_template(invite.templateId)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    config = InterviewConfig(
        uiLanguage="pt-BR",
        interviewLanguage="pt-BR",
        track="technical",
        seniority=tpl.get("seniority") or "",
        stacks=tpl.get("topics") or [],
        style="standard",
        duration=int(tpl.get("timeLimit") or 20),
        jobDescription=None,
        plan="business",
        interviewMode=("candidate_coaching_mode" if (invite.interviewMode or "ai") == "ai" else "human_interviewer_mode"),
    )

    payload = OrchestratorStartRequest(config=config, includeContext=True)
    # start orchestrator using internal service (no firebase auth) by passing our temp user
    data = interview_orchestrator.start_orchestrated_interview(payload=payload, user=user)
    return data
