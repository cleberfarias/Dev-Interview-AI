import { auth } from "../src/lib/firebase";
import type { InterviewConfig, InterviewPlan, AnswerEvaluation, FinalReport, User, SessionStartResponse, PlanGenerateResponse } from "../types";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "/api";

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  // Se o caller já passou Authorization, use-o
  if (!headers.get('Authorization')) {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken(/* forceRefresh */ false);
        if (token) headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (e) {
      console.warn('Failed to get auth token:', e);
      // continua sem Authorization
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
  health: () => apiFetch<{ ok: boolean; time: string }>("/health"),

  me: () => apiFetch<User>("/me"),

  // alternative: call /me providing an explicit token (useful immediately after sign-in)
  meWithToken: (token: string | null) => {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
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

  tts: (text: string, language = 'pt-BR') =>
    apiFetch<{ audioBase64: string; mimeType: string }>("/ai/tts", {
      method: 'POST',
      body: JSON.stringify({ text, language }),
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
