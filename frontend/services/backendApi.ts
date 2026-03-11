import { auth } from "../src/lib/firebase";
import type {
  InterviewConfig,
  InterviewPlan,
  AnswerEvaluation,
  FinalReport,
  User,
  SessionStartResponse,
  PlanGenerateResponse,
  NextQuestionResponse,
} from "../types";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "/api";
const TOKEN_SKEW_MS = 60_000;

let cachedToken: string | null = null;
let cachedTokenExpMs = 0;

const decodeJwtExpMs = (token: string): number => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const getValidAuthToken = async (): Promise<string | null> => {
  if (cachedToken && Date.now() + TOKEN_SKEW_MS < cachedTokenExpMs) {
    return cachedToken;
  }

  const user = auth.currentUser;
  if (!user) {
    cachedToken = null;
    cachedTokenExpMs = 0;
    return null;
  }

  const token = await user.getIdToken(false);
  cachedToken = token || null;
  cachedTokenExpMs = token ? decodeJwtExpMs(token) : 0;
  return cachedToken;
};

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  const useAuth = options.auth ?? true;

  if (useAuth && !headers.get("Authorization")) {
    try {
      const token = await getValidAuthToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch (e) {
      console.warn("Failed to get auth token:", e);
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.error || text;
    } catch {}
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const BackendApi = {
  health: () => apiFetch<{ ok: boolean; time: string }>("/health", {}, { auth: false }),
  warmup: () => apiFetch<{ ok: boolean; time: string }>("/health", {}, { auth: false }),

  me: () => apiFetch<User>("/me"),

  // Alternative: call /me with an explicit token right after sign-in.
  meWithToken: (token: string | null) => {
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      cachedToken = token;
      cachedTokenExpMs = decodeJwtExpMs(token);
    }
    return apiFetch<User>("/me", { headers });
  },

  startSession: (config: InterviewConfig) =>
    apiFetch<SessionStartResponse>("/sessions/start", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  generatePlan: (sessionId: string) =>
    apiFetch<PlanGenerateResponse>(`/sessions/${sessionId}/plan/generate`, { method: "POST" }),

  nameExtract: (audioBase64: string, mimeType = "audio/webm", uiLanguage = "pt-BR") =>
    apiFetch<{ name: string }>("/ai/name-extract", {
      method: "POST",
      body: JSON.stringify({ audioBase64, mimeType, uiLanguage }),
    }),

  evaluateAudio: (payload: {
    config: InterviewConfig;
    question: string;
    audioBase64: string;
    mimeType?: string;
    confirmedName?: string;
  }) =>
    apiFetch<AnswerEvaluation>("/ai/evaluate-audio", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  finalReport: (payload: { config: InterviewConfig; history: any[] }) =>
    apiFetch<FinalReport>("/ai/final-report", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  nextQuestion: (payload: {
    config: InterviewConfig;
    history: any[];
    remainingSeconds: number;
    difficultyLevel?: number;
  }) =>
    apiFetch<NextQuestionResponse>("/ai/next-question", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  tts: (text: string, language = "pt-BR", voice?: string) =>
    apiFetch<{ audioBase64: string; mimeType: string }>("/ai/tts", {
      method: "POST",
      body: JSON.stringify({ text, language, voice }),
    }),

  finishSession: (sessionId: string, report: FinalReport, meta: any = {}) =>
    apiFetch<{ ok: boolean }>(`/sessions/${sessionId}/finish`, {
      method: "POST",
      body: JSON.stringify({ report, meta }),
    }),

  deleteSession: (sessionId: string) =>
    apiFetch<{ ok: boolean }>(`/sessions/${sessionId}`, { method: "DELETE" }),

  devAddCredits: (amount = 3) =>
    apiFetch<{ credits: number }>(`/credits/dev-add?amount=${amount}`, { method: "POST" }),
};
