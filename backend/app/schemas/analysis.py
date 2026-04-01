from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class ResumeAnalyzeRequest(BaseModel):
    fileName: str
    fileBase64: str
    mimeType: Optional[str] = None
    jobDescription: Optional[str] = None


class ResumeExtraction(BaseModel):
    technologies: List[str] = Field(default_factory=list)
    experienceLevel: str = "unknown"
    projects: List[str] = Field(default_factory=list)
    companies: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    resumeSummary: str = ""


class ResumeMatchResult(BaseModel):
    matchScore: int = 0
    strongSkills: List[str] = Field(default_factory=list)
    weakSkills: List[str] = Field(default_factory=list)
    missingSkills: List[str] = Field(default_factory=list)
    interviewSuggestions: List[str] = Field(default_factory=list)


class AnalysisTrace(BaseModel):
    source: str = "heuristic"
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    promptVersion: Optional[str] = None
    confidence: Optional[float] = None


class ProfileAnalysisAuditItem(BaseModel):
    kind: str
    source: str = "heuristic"
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    summary: Optional[dict[str, Any]] = None
    createdAt: str


class ResumeAnalysisRecord(BaseModel):
    id: Optional[str] = None
    userId: str
    fileName: str
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    source: str = "heuristic"
    promptVersion: Optional[str] = None
    parsingMode: Optional[str] = None
    extraction: ResumeExtraction
    match: Optional[ResumeMatchResult] = None
    confidence: Optional[float] = None
    createdAt: str


class JobAnalysisRecord(BaseModel):
    id: Optional[str] = None
    userId: str
    jobDescription: str
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    source: str = "heuristic"
    promptVersion: Optional[str] = None
    analysis: JobAnalysisResult
    gap: Optional[ResumeMatchResult] = None
    confidence: Optional[float] = None
    createdAt: str


class ResumeAnalyzeResponse(BaseModel):
    text: str
    extraction: ResumeExtraction
    match: Optional[ResumeMatchResult] = None
    extractionTrace: AnalysisTrace = Field(default_factory=AnalysisTrace)


class JobAnalyzeRequest(BaseModel):
    jobDescription: str
    resumeTechnologies: List[str] = Field(default_factory=list)


class JobAnalysisResult(BaseModel):
    roleTitleGuess: str
    seniorityGuess: str
    requiredSkills: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    softSkills: List[str] = Field(default_factory=list)
    interviewFocus: List[str] = Field(default_factory=list)


class JobAnalyzeResponse(BaseModel):
    analysis: JobAnalysisResult
    gap: Optional[ResumeMatchResult] = None
    analysisTrace: AnalysisTrace = Field(default_factory=AnalysisTrace)


class CandidateProfile(BaseModel):
    userId: str
    targetRole: Optional[str] = None
    experienceLevel: Optional[str] = None
    primarySkills: List[str] = Field(default_factory=list)
    weakSkills: List[str] = Field(default_factory=list)
    resumeSummary: Optional[str] = None
    jobDescription: Optional[str] = None
    lastResumeAnalysisTrace: Optional[AnalysisTrace] = None
    lastJobAnalysisTrace: Optional[AnalysisTrace] = None
    lastResumeAnalysisId: Optional[str] = None
    lastJobAnalysisId: Optional[str] = None
    lastMatchScore: Optional[int] = None
    recentResumeAnalysisIds: List[str] = Field(default_factory=list)
    recentJobAnalysisIds: List[str] = Field(default_factory=list)
    analysisAudit: List[ProfileAnalysisAuditItem] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class CandidateProfileUpsertRequest(BaseModel):
    targetRole: Optional[str] = None
    experienceLevel: Optional[str] = None
    primarySkills: List[str] = Field(default_factory=list)
    weakSkills: List[str] = Field(default_factory=list)
    resumeSummary: Optional[str] = None
    jobDescription: Optional[str] = None


class CandidateProfileAuditPageResponse(BaseModel):
    items: List[ProfileAnalysisAuditItem] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 20
    hasMore: bool = False
    nextOffset: Optional[int] = None


class SpeechMetrics(BaseModel):
    answerId: str
    timeToFirstSpeechMs: int = 0
    totalDurationMs: int = 0
    silenceDurationMs: int = 0
    pauseCount: int = 0
    longPauseCount: int = 0
    fillerCount: int = 0
    hesitationMarkers: List[str] = Field(default_factory=list)
    wordsPerMinute: Optional[float] = None
    interruptionRecoveryCount: Optional[int] = None
    fluencyScore: Optional[float] = None
    fluencyLevel: Optional[str] = None


class HiringCommunicationSignals(BaseModel):
    responseClarity: float = 0.0
    responseConfidence: float = 0.0
    hesitationLevel: float = 0.0
    verbalObjectivity: float = 0.0
    professionalCommunication: float = 0.0


class BehavioralSpeechSignals(BaseModel):
    assertiveness: float = 0.0
    cautionLevel: float = 0.0
    spontaneity: float = 0.0
    consistency: float = 0.0
    emotionalControl: float = 0.0


class DiscReadinessSignals(BaseModel):
    dominance: float = 0.0
    influence: float = 0.0
    steadiness: float = 0.0
    conscientiousness: float = 0.0


class BehaviorProfile(BaseModel):
    communicationStyle: str = "balanced"
    observedTraits: List[str] = Field(default_factory=list)
    summary: str = ""
    discReadiness: DiscReadinessSignals = Field(default_factory=DiscReadinessSignals)
    guardrail: str = (
        "Indicadores observados durante a entrevista; nao representam diagnostico psicologico ou laudo de personalidade."
    )


class CultureFitSignals(BaseModel):
    collaboration: float = 0.0
    ownership: float = 0.0
    adaptability: float = 0.0
    communicationFit: float = 0.0
    overallAlignment: float = 0.0
    supportingSignals: List[str] = Field(default_factory=list)
    summary: str = ""
    guardrail: str = "Sinais de apoio a decisao; nao substituem avaliacao humana."


class PartialFeedback(BaseModel):
    type: str = "partial_feedback"
    severity: str = "low"
    message: str


class CommunicationAnalysisPayload(BaseModel):
    answerId: str
    mode: str = "candidate_coaching_mode"
    speechMetrics: Optional[SpeechMetrics] = None
    communicationSignals: Optional[HiringCommunicationSignals] = None
    behavioralSpeechSignals: Optional[BehavioralSpeechSignals] = None
    behaviorProfile: Optional[BehaviorProfile] = None
    cultureFitSignals: Optional[CultureFitSignals] = None


class ResumeAnalysisPageResponse(BaseModel):
    items: List[ResumeAnalysisRecord] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 20
    hasMore: bool = False
    nextOffset: Optional[int] = None


class JobAnalysisPageResponse(BaseModel):
    items: List[JobAnalysisRecord] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 20
    hasMore: bool = False
    nextOffset: Optional[int] = None


class SessionAnalysisTraceResponse(BaseModel):
    sessionId: str
    hasTrace: bool = False
    analysisTraceSnapshot: Optional[dict[str, Any]] = None


class MCPToolDebuggerItem(BaseModel):
    name: str
    label: str
    contractVersion: Optional[str] = None
    status: str = "ready"
    summary: Optional[str] = None
    data: Optional[dict[str, Any]] = None


class MCPToolDebuggerResponse(BaseModel):
    generatedAt: str
    sessionId: Optional[str] = None
    tools: List[MCPToolDebuggerItem] = Field(default_factory=list)
