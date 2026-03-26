from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

LanguageCode = str
Track = str
Seniority = str
InterviewStyle = str
PlanType = str


class InterviewConfig(BaseModel):
    uiLanguage: LanguageCode
    interviewLanguage: LanguageCode
    track: Track
    seniority: Seniority
    stacks: List[str]
    style: InterviewStyle
    duration: int
    jobDescription: Optional[str] = None
    plan: PlanType
    interviewMode: str = "candidate_coaching_mode"
    interviewModeLevel: Optional[int] = None


class InterviewQuestion(BaseModel):
    id: str
    section: str
    difficulty: float
    prompt: str


class InterviewPlan(BaseModel):
    roleTitleGuess: str
    seniorityGuess: str
    mustHaveSkills: List[str]
    blueprint: Dict[str, float]
    questions: List[InterviewQuestion]


class SessionStartResponse(BaseModel):
    sessionId: str
    plan: Optional[InterviewPlan] = None
    plan_status: str = "pending"
    credits: int


class PlanGenerateResponse(BaseModel):
    sessionId: str
    plan: InterviewPlan
    plan_status: str
    provider_used: str
    model_used: str
    latency_ms: int
    tokens_used: Optional[int] = None
    credits: int


class NameExtractRequest(BaseModel):
    audioBase64: str
    mimeType: str = "audio/webm"
    uiLanguage: LanguageCode = "pt-BR"


class EvaluateAudioRequest(BaseModel):
    config: InterviewConfig
    question: str
    audioBase64: str
    mimeType: str = "audio/webm"
    confirmedName: Optional[str] = None
    sessionId: Optional[str] = None


class EvaluateTextRequest(BaseModel):
    config: InterviewConfig
    question: str
    transcript: str
    confirmedName: Optional[str] = None
    sessionId: Optional[str] = None


class NextQuestionRequest(BaseModel):
    config: InterviewConfig
    history: List[Dict[str, Any]]
    remainingSeconds: int = 0
    difficultyLevel: Optional[int] = None
    sessionId: Optional[str] = None


class NextQuestionResponse(BaseModel):
    shouldFinish: bool = False
    reason: Optional[str] = None
    question: Optional[InterviewQuestion] = None
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_used: Optional[int] = None
