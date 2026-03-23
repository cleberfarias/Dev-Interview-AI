from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .analysis import BehaviorProfile, CommunicationAnalysisPayload, CultureFitSignals, SpeechMetrics
from .avatar import AvatarResponse
from .interview import InterviewConfig, NextQuestionResponse, SessionStartResponse
from .report import AnswerEvaluation, FinalReport


class OrchestratorContextRequest(BaseModel):
    config: InterviewConfig
    resumeText: Optional[str] = None
    jobDescription: Optional[str] = None


class OrchestratorContextResponse(BaseModel):
    profile: Dict[str, Any] = Field(default_factory=dict)
    candidate_memory: Dict[str, Any] = Field(default_factory=dict)
    candidate: Dict[str, Any] = Field(default_factory=dict)
    job: Dict[str, Any] = Field(default_factory=dict)
    match: Dict[str, Any] = Field(default_factory=dict)
    behaviorProfile: Optional[BehaviorProfile] = None
    cultureFitProfile: Optional[CultureFitSignals] = None


class OrchestratorStartRequest(BaseModel):
    config: InterviewConfig
    resumeText: Optional[str] = None
    jobDescription: Optional[str] = None
    includeContext: bool = True
    difficultyLevel: Optional[int] = None


class OrchestratorStartResponse(BaseModel):
    session: SessionStartResponse
    context: Optional[OrchestratorContextResponse] = None
    initialNextQuestion: Optional[NextQuestionResponse] = None
    initialAvatar: Optional[AvatarResponse] = None


class OrchestratorTurnRequest(BaseModel):
    config: InterviewConfig
    sessionId: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)
    question: str
    remainingSeconds: int = 0
    difficultyLevel: Optional[int] = None
    confirmedName: Optional[str] = None
    answerId: Optional[str] = None
    interviewMode: Optional[str] = "candidate_coaching_mode"
    speechMetrics: Optional[SpeechMetrics] = None
    transcript: Optional[str] = None
    audioBase64: Optional[str] = None
    mimeType: str = "audio/webm"
    includeAvatar: bool = False


class OrchestratorTurnResponse(BaseModel):
    evaluation: AnswerEvaluation
    coach: Dict[str, Any] = Field(default_factory=dict)
    nextQuestion: NextQuestionResponse
    avatar: Optional[AvatarResponse] = None
    communicationAnalysis: Optional[CommunicationAnalysisPayload] = None


class OrchestratorFinalizeRequest(BaseModel):
    config: InterviewConfig
    sessionId: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)


class OrchestratorFinalizeResponse(BaseModel):
    report: FinalReport
    studyPlan: Dict[str, Any] = Field(default_factory=dict)
