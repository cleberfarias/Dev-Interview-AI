import type { DifficultyLevel, InterviewModeLevel } from './interview';

export type LanguageCode = 'pt-BR' | 'es' | 'en';
export type Track = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'devops' | 'data';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'staff';
export type InterviewStyle = 'friendly' | 'neutral' | 'strict';
export type PlanType = 'free' | 'pro';
export type InterviewMode = 'candidate_coaching_mode' | 'hiring_assessment_mode';
export type FluencyLevel = 'low' | 'moderate' | 'high';

export interface InterviewHistoryItem {
  id: string;
  date: string;
  role: string;
  score: number;
  style: string;
  track: string;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  avatar?: string;
  credits: number;
  provider?: 'google' | 'github' | 'bio' | 'email' | 'firebase';
  interviews: InterviewHistoryItem[];
}

export interface InterviewConfig {
  uiLanguage: LanguageCode;
  interviewLanguage: LanguageCode;
  track: Track;
  seniority: Seniority;
  stacks: string[];
  style: InterviewStyle;
  duration: number;
  jobDescription?: string;
  plan: PlanType;
  interviewMode: InterviewMode;
  interviewModeLevel?: InterviewModeLevel;
  difficultyLevel?: DifficultyLevel;
}

export interface InterviewPlan {
  roleTitleGuess: string;
  seniorityGuess: string;
  mustHaveSkills: string[];
  blueprint: {
    hr: number;
    technical: number;
    design: number;
    behavioral: number;
  };
  questions: Array<{
    id: string;
    section: 'hr' | 'technical' | 'design' | 'behavioral';
    difficulty: number;
    prompt: string;
  }>;
}

export interface SessionStartResponse {
  sessionId: string;
  plan: InterviewPlan | null;
  plan_status: string;
  credits: number;
}

export interface PlanGenerateResponse {
  sessionId: string;
  plan: InterviewPlan;
  plan_status: string;
  provider_used: string;
  model_used: string;
  latency_ms: number;
  tokens_used?: number;
  credits: number;
}

export interface AnswerEvaluation {
  scores: {
    communication: number;
    technical: number;
    problemSolving: number;
    presence: number;
  };
  criteriaScores?: {
    clarity: number;
    structure: number;
    relevance: number;
    technicalPrecision: number;
    communication: number;
  };
  strengths: string[];
  improvements: string[];
  followUpNeeded: boolean;
  followUpQuestion?: string;
  transcript: string;
}

export interface SpeechMetrics {
  answerId: string;
  timeToFirstSpeechMs: number;
  totalDurationMs: number;
  silenceDurationMs: number;
  pauseCount: number;
  longPauseCount: number;
  fillerCount: number;
  hesitationMarkers: string[];
  wordsPerMinute?: number;
  interruptionRecoveryCount?: number;
  fluencyScore?: number;
  fluencyLevel?: FluencyLevel;
}

export interface HiringCommunicationSignals {
  responseClarity: number;
  responseConfidence: number;
  hesitationLevel: number;
  verbalObjectivity: number;
  professionalCommunication: number;
}

export interface BehavioralSpeechSignals {
  assertiveness: number;
  cautionLevel: number;
  spontaneity: number;
  consistency: number;
  emotionalControl: number;
}

export interface DiscReadinessSignals {
  dominance: number;
  influence: number;
  steadiness: number;
  conscientiousness: number;
}

export interface BehaviorProfile {
  communicationStyle: string;
  observedTraits: string[];
  summary: string;
  discReadiness: DiscReadinessSignals;
  guardrail: string;
}

export interface CultureFitSignals {
  collaboration: number;
  ownership: number;
  adaptability: number;
  communicationFit: number;
  overallAlignment: number;
  supportingSignals: string[];
  summary: string;
  guardrail: string;
}

export interface PartialFeedback {
  type: 'partial_feedback';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface CommunicationScore {
  clarity: number;
  fluency: number;
  confidence: number;
  conciseness: number;
  structure: number;
  overall: number;
}

export interface CommunicationAnalysis {
  answerId: string;
  mode: InterviewMode;
  speechMetrics?: SpeechMetrics | null;
  communicationSignals?: HiringCommunicationSignals | null;
  behavioralSpeechSignals?: BehavioralSpeechSignals | null;
  behaviorProfile?: BehaviorProfile | null;
  cultureFitSignals?: CultureFitSignals | null;
}

export interface FinalReport {
  overallScore: number;
  levelEstimate: Seniority;
  jobMatch: {
    covered: string[];
    gaps: string[];
  };
  feedback: {
    posture: string[];
    communication: string[];
    technical: string[];
    language: string[];
  };
  plan7Days: Array<{
    day: number;
    task: string;
  }>;
  scoresSummary?: {
    communication: number;
    technical: number;
    problemSolving: number;
    presence: number;
  };
  criteriaSummary?: {
    clarity: number;
    structure: number;
    relevance: number;
    technicalPrecision: number;
    communication: number;
  };
  communicationScore?: CommunicationScore;
  communicationStrengths?: string[];
  communicationImprovements?: string[];
  communicationSignals?: HiringCommunicationSignals | null;
  behavioralSpeechSignals?: BehavioralSpeechSignals | null;
  behaviorProfile?: BehaviorProfile | null;
  cultureFitSignals?: CultureFitSignals | null;
  reportSource?: 'ai' | 'local_fallback';
  reportStatus?: 'complete' | 'fallback' | 'payment_required' | 'insufficient_data';
  reportWarnings?: string[];
}

export interface NextQuestionResponse {
  shouldFinish: boolean;
  reason?: string;
  question?: {
    id: string;
    section: 'hr' | 'technical' | 'design' | 'behavioral';
    difficulty: number;
    prompt: string;
  };
  provider_used?: string;
  model_used?: string;
  latency_ms?: number;
  tokens_used?: number;
}

export interface AgentRuntimeRecord {
  name: string;
  status: 'completed' | 'fallback' | 'skipped' | 'error';
  source: 'system' | 'heuristic' | 'ai' | 'hybrid';
  confidence?: number | null;
  promptVersion?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  usedTools?: string[];
  evidence?: string[];
  summary?: string | null;
}

export interface KnowledgeRetrievalSource {
  id: string;
  sourceType: 'resume' | 'job' | 'memory' | 'history' | 'rubric' | string;
  title: string;
  snippet: string;
  score: number;
  reason?: string | null;
  tags?: string[];
  capturedAt?: string | null;
}

export interface KnowledgeRetrievalContext {
  summary?: string | null;
  quality?: 'strong' | 'good' | 'moderate' | 'initial' | string;
  score?: number | null;
  queryTerms?: string[];
  coverage?: Record<string, boolean>;
  sources?: KnowledgeRetrievalSource[];
  matchScore?: number | null;
  retrievalMode?: 'semantic' | string;
  indexStats?: {
    backend?: string;
    chunks?: number;
    embeddingStrategy?: string;
    embeddingProvider?: string | null;
    embeddingModel?: string | null;
    reusedVectors?: number;
    updatedVectors?: number;
    persisted?: boolean;
  } | null;
  generatedAt?: string | null;
}

export interface OrchestratorContextResponse {
  profile: Record<string, unknown>;
  candidate_memory?: Record<string, unknown>;
  candidate: Record<string, unknown>;
  job: Record<string, unknown>;
  match: Record<string, unknown>;
  agentRuntime?: Record<string, AgentRuntimeRecord>;
  knowledgeRetrieval?: KnowledgeRetrievalContext | null;
  behaviorProfile?: BehaviorProfile | null;
  cultureFitProfile?: CultureFitSignals | null;
}

export interface OrchestratorStartResponse {
  session: SessionStartResponse;
  context?: OrchestratorContextResponse | null;
  initialNextQuestion?: NextQuestionResponse | null;
  initialAvatar?: AvatarResponse | null;
}

export interface OrchestratorTurnResponse {
  evaluation: AnswerEvaluation;
  coach: {
    tips?: string[];
    reinforce?: string[];
    idealAnswerOutline?: string[];
    [key: string]: unknown;
  };
  nextQuestion: NextQuestionResponse;
  avatar?: AvatarResponse | null;
  communicationAnalysis?: CommunicationAnalysis | null;
}

export interface OrchestratorFinalizeResponse {
  report: FinalReport;
  studyPlan: {
    priorityTopics?: string[];
    weeklyPlan?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

export interface ResumeExtraction {
  technologies: string[];
  experienceLevel: string;
  projects: string[];
  companies: string[];
  responsibilities: string[];
  resumeSummary: string;
}

export interface ResumeMatchResult {
  matchScore: number;
  strongSkills: string[];
  weakSkills: string[];
  missingSkills: string[];
  interviewSuggestions: string[];
}

export interface AnalysisTrace {
  source: 'heuristic' | 'ai' | 'hybrid';
  aiProvider?: string | null;
  aiModel?: string | null;
  promptVersion?: string | null;
  confidence?: number | null;
}

export interface ProfileAnalysisAuditItem {
  kind: 'resume' | 'job' | string;
  source: 'heuristic' | 'ai' | 'hybrid' | string;
  aiProvider?: string | null;
  aiModel?: string | null;
  summary?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ResumeAnalysisRecord {
  id?: string;
  userId: string;
  fileName: string;
  aiProvider?: string | null;
  aiModel?: string | null;
  source: 'heuristic' | 'ai' | 'hybrid' | string;
  promptVersion?: string | null;
  parsingMode?: string | null;
  extraction: ResumeExtraction;
  match?: ResumeMatchResult | null;
  confidence?: number | null;
  createdAt: string;
}

export interface JobAnalysisRecord {
  id?: string;
  userId: string;
  jobDescription: string;
  aiProvider?: string | null;
  aiModel?: string | null;
  source: 'heuristic' | 'ai' | 'hybrid' | string;
  promptVersion?: string | null;
  analysis: JobAnalysisResult;
  gap?: ResumeMatchResult | null;
  confidence?: number | null;
  createdAt: string;
}

export interface CandidateProfileAuditPageResponse {
  items: ProfileAnalysisAuditItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset?: number | null;
}

export interface ResumeAnalysisPageResponse {
  items: ResumeAnalysisRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset?: number | null;
}

export interface JobAnalysisPageResponse {
  items: JobAnalysisRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset?: number | null;
}

export interface SessionAnalysisTraceResponse {
  sessionId: string;
  hasTrace: boolean;
  analysisTraceSnapshot?: SessionAnalysisTraceSnapshot | null;
}

export interface SessionClientRuntimeTrace {
  headline?: string | null;
  tone?: 'idle' | 'active' | 'warning' | 'done' | string | null;
  questionDeliveryLatencyMs?: number | null;
  analysisLatencyMs?: number | null;
  stageElapsedMs?: number | null;
  sessionElapsedSeconds?: number | null;
  pendingChunkCount?: number | null;
  partialTranscriptActive?: boolean;
  partialFeedbackVisible?: boolean;
  showLiveCoachPanel?: boolean;
  transportState?: string | null;
  progressState?: string | null;
  avatarState?: string | null;
  coachState?: string | null;
}

export interface SessionEvidenceHighlight {
  answerId: string;
  question?: string | null;
  transcriptSnippet?: string | null;
  strengths?: string[];
  improvements?: string[];
  clientRuntime?: SessionClientRuntimeTrace | null;
}

export interface SessionToolCallTrace {
  toolName: string;
  contractVersion?: string | null;
  transport?: 'http' | 'local' | string | null;
  status?: 'ready' | 'empty' | 'error' | string | null;
  calledAt?: string | null;
  summary?: string | null;
  arguments?: Record<string, unknown> | null;
}

export interface SessionTurnEvidenceTrace {
  answerId: string;
  capturedAt?: string | null;
  question?: string | null;
  transcriptSnippet?: string | null;
  strengths?: string[];
  improvements?: string[];
  clientRuntime?: SessionClientRuntimeTrace | null;
  scores?: {
    communication?: number;
    technical?: number;
    problemSolving?: number;
    presence?: number;
  } | null;
  nextQuestionContext?: {
    quality?: KnowledgeRetrievalContext['quality'];
    retrievalMode?: KnowledgeRetrievalContext['retrievalMode'];
    queryTerms?: string[];
    sources?: Array<Pick<KnowledgeRetrievalSource, 'title' | 'sourceType' | 'score' | 'reason'>>;
    episodeHighlights?: SessionEvidenceHighlight[];
    toolCalls?: SessionToolCallTrace[];
  } | null;
}

export interface SessionReportEvidenceTrace {
  capturedAt?: string | null;
  quality?: KnowledgeRetrievalContext['quality'];
  retrievalMode?: KnowledgeRetrievalContext['retrievalMode'];
  queryTerms?: string[];
  sources?: Array<Pick<KnowledgeRetrievalSource, 'title' | 'sourceType' | 'score' | 'reason'>>;
  episodeHighlights?: SessionEvidenceHighlight[];
  toolCalls?: SessionToolCallTrace[];
}

export interface SessionAnalysisTraceSnapshot {
  capturedAt?: string | null;
  lastResumeAnalysisTrace?: AnalysisTrace | null;
  lastJobAnalysisTrace?: AnalysisTrace | null;
  analysisAuditRecent?: ProfileAnalysisAuditItem[] | null;
  agentRuntime?: Record<string, AgentRuntimeRecord> | null;
  knowledgeRetrieval?: KnowledgeRetrievalContext | null;
  contextToolCalls?: SessionToolCallTrace[] | null;
  turnEvidenceTimeline?: {
    answers?: Record<string, SessionTurnEvidenceTrace>;
  } | null;
  reportEvidence?: SessionReportEvidenceTrace | null;
}

export interface SessionReportResponse {
  sessionId: string;
  hasReport: boolean;
  config?: InterviewConfig | null;
  report?: FinalReport | null;
}

export interface MCPToolDebuggerItem {
  name: string;
  label: string;
  contractVersion?: string | null;
  status: 'ready' | 'empty' | 'error' | string;
  summary?: string | null;
  data?: Record<string, unknown> | null;
}

export interface MCPToolDebuggerResponse {
  generatedAt: string;
  sessionId?: string | null;
  tools: MCPToolDebuggerItem[];
}

export interface ResumeAnalyzeResponse {
  text: string;
  extraction: ResumeExtraction;
  match?: ResumeMatchResult;
  extractionTrace?: AnalysisTrace;
}

export interface JobAnalysisResult {
  roleTitleGuess: string;
  seniorityGuess: string;
  requiredSkills: string[];
  responsibilities: string[];
  softSkills: string[];
  interviewFocus: string[];
}

export interface JobAnalyzeResponse {
  analysis: JobAnalysisResult;
  gap?: ResumeMatchResult;
  analysisTrace?: AnalysisTrace;
}

export interface CandidateProfile {
  userId: string;
  targetRole?: string | null;
  experienceLevel?: string | null;
  primarySkills: string[];
  weakSkills: string[];
  resumeSummary?: string | null;
  jobDescription?: string | null;
  lastResumeAnalysisTrace?: AnalysisTrace | null;
  lastJobAnalysisTrace?: AnalysisTrace | null;
  lastResumeAnalysisId?: string | null;
  lastJobAnalysisId?: string | null;
  lastMatchScore?: number | null;
  recentResumeAnalysisIds?: string[];
  recentJobAnalysisIds?: string[];
  analysisAudit?: ProfileAnalysisAuditItem[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CandidateProfileUpsertRequest {
  targetRole?: string | null;
  experienceLevel?: string | null;
  primarySkills: string[];
  weakSkills: string[];
  resumeSummary?: string | null;
  jobDescription?: string | null;
}

export interface LiveCoachProcessResponse {
  status: string;
  transcript: string;
  detectedQuestion?: string | null;
  questionType?: string | null;
  suggestion?: string | null;
  recommendedStructure?: string[];
  keyPoints?: string[];
  transcriptionProvider?: string | null;
  transcriptionError?: string | null;
  contextUsed: boolean;
  audioReceived: boolean;
  mode?: InterviewMode;
  partialFeedback?: PartialFeedback | null;
  partialFeedbackTriggered?: boolean;
  speechMetrics?: SpeechMetrics | null;
  communicationSignals?: HiringCommunicationSignals | null;
  behavioralSpeechSignals?: BehavioralSpeechSignals | null;
}

export interface AvatarVisemeFrame {
  time: number;
  viseme: string;
}

export interface AvatarResponse {
  audio: string;
  mimeType: string;
  lipsync: {
    frames: AvatarVisemeFrame[];
    durationMs: number;
  };
  emotion: string;
  ttsProvider: string;
  render: {
    state: string;
    facialPreset: string;
    intensity: number;
    meta: Record<string, unknown>;
  };
}

export enum AppState {
  LANDING = 'LANDING',
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  PROFILE = 'PROFILE',
  ONBOARDING = 'ONBOARDING',
  LOBBY = 'LOBBY',
  INTERVIEWING = 'INTERVIEWING',
  PROCESSING = 'PROCESSING',
  REPORT = 'REPORT'
}
