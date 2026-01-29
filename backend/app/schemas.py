from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

LanguageCode = str
Track = str
Seniority = str
InterviewStyle = str
PlanType = str

class InterviewHistoryItem(BaseModel):
    id: str
    date: str
    role: str
    score: float
    style: str
    track: str

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

class AnswerScores(BaseModel):
    communication: float
    technical: float
    problemSolving: float
    presence: float

class AnswerEvaluation(BaseModel):
    scores: AnswerScores
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

class UserProfile(BaseModel):
    uid: str
    name: str
    email: str
    avatar: Optional[str] = None
    credits: int = 0
    interviews: List[InterviewHistoryItem] = Field(default_factory=list)

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

class FinalReportRequest(BaseModel):
    config: InterviewConfig
    history: List[Dict[str, Any]]

class SessionFinishRequest(BaseModel):
    report: FinalReport
    meta: Dict[str, Any] = Field(default_factory=dict)
