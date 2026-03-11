import type { DifficultyLevel } from './interview';

export type LanguageCode = 'pt-BR' | 'es' | 'en';
export type Track = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'devops' | 'data';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'staff';
export type InterviewStyle = 'friendly' | 'neutral' | 'strict';
export type PlanType = 'free' | 'pro';

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
}

export interface ProfileAnalysisAuditItem {
  kind: 'resume' | 'job' | string;
  source: 'heuristic' | 'ai' | 'hybrid' | string;
  aiProvider?: string | null;
  aiModel?: string | null;
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

export interface SessionAnalysisTraceResponse {
  sessionId: string;
  hasTrace: boolean;
  analysisTraceSnapshot?: Record<string, unknown> | null;
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
