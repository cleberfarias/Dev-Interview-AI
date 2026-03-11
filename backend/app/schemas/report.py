from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .interview import InterviewConfig


class AnswerScores(BaseModel):
    communication: float
    technical: float
    problemSolving: float
    presence: float


class AnswerCriteriaScores(BaseModel):
    clarity: float
    structure: float
    relevance: float
    technicalPrecision: float
    communication: float


class AnswerEvaluation(BaseModel):
    scores: AnswerScores
    criteriaScores: Optional[AnswerCriteriaScores] = None
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    followUpNeeded: bool = False
    followUpQuestion: Optional[str] = None
    transcript: str


class FinalReport(BaseModel):
    overallScore: float
    levelEstimate: str
    jobMatch: Dict[str, List[str]]
    feedback: Dict[str, List[str]]
    plan7Days: List[Dict[str, Any]]
    scoresSummary: Optional[AnswerScores] = None
    criteriaSummary: Optional[AnswerCriteriaScores] = None


class FinalReportRequest(BaseModel):
    config: InterviewConfig
    history: List[Dict[str, Any]]


class SessionFinishRequest(BaseModel):
    report: FinalReport
    meta: Dict[str, Any] = Field(default_factory=dict)
