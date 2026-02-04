
import type { DifficultyLevel } from './types/interview';

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
