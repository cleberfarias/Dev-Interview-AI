from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .interview import InterviewConfig, NextQuestionResponse, SessionStartResponse
from .report import AnswerEvaluation, FinalReport


class OrchestratorContextRequest(BaseModel):
    config: InterviewConfig
    resumeText: Optional[str] = None
    jobDescription: Optional[str] = None


class OrchestratorContextResponse(BaseModel):
    profile: Dict[str, Any] = Field(default_factory=dict)
    candidate: Dict[str, Any] = Field(default_factory=dict)
    job: Dict[str, Any] = Field(default_factory=dict)
    match: Dict[str, Any] = Field(default_factory=dict)


class OrchestratorStartRequest(BaseModel):
    config: InterviewConfig
    resumeText: Optional[str] = None
    jobDescription: Optional[str] = None
    includeContext: bool = True


class OrchestratorStartResponse(BaseModel):
    session: SessionStartResponse
    context: Optional[OrchestratorContextResponse] = None


class OrchestratorTurnRequest(BaseModel):
    config: InterviewConfig
    history: List[Dict[str, Any]] = Field(default_factory=list)
    question: str
    remainingSeconds: int = 0
    difficultyLevel: Optional[int] = None
    confirmedName: Optional[str] = None
    transcript: Optional[str] = None
    audioBase64: Optional[str] = None
    mimeType: str = "audio/webm"


class OrchestratorTurnResponse(BaseModel):
    evaluation: AnswerEvaluation
    coach: Dict[str, Any] = Field(default_factory=dict)
    nextQuestion: NextQuestionResponse


class OrchestratorFinalizeRequest(BaseModel):
    config: InterviewConfig
    history: List[Dict[str, Any]] = Field(default_factory=list)


class OrchestratorFinalizeResponse(BaseModel):
    report: FinalReport
    studyPlan: Dict[str, Any] = Field(default_factory=dict)
