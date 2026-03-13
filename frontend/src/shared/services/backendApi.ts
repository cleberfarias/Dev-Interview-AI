import { auth } from "../../lib/firebase";
import type {
  InterviewConfig,
  InterviewPlan,
  AnswerEvaluation,
  FinalReport,
  User,
  SessionStartResponse,
  PlanGenerateResponse,
  NextQuestionResponse,
  OrchestratorContextResponse,
  OrchestratorFinalizeResponse,
  OrchestratorStartResponse,
  OrchestratorTurnResponse,
  CandidateProfile,
  CandidateProfileAuditPageResponse,
  CandidateProfileUpsertRequest,
  JobAnalysisPageResponse,
  ResumeAnalyzeResponse,
  ResumeAnalysisPageResponse,
  JobAnalyzeResponse,
  LiveCoachProcessResponse,
  SessionAnalysisTraceResponse,
} from "../types";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "/api";
const TOKEN_SKEW_MS = 60_000;
const LIVE_COACH_WS_CONNECT_TIMEOUT_MS = 7000;

let cachedToken: string | null = null;
let cachedTokenExpMs = 0;
let cachedTokenUid: string | null = null;

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
  const user = auth.currentUser;
  if (!user) {
    cachedToken = null;
    cachedTokenExpMs = 0;
    cachedTokenUid = null;
    return null;
  }

  if (
    cachedToken &&
    cachedTokenUid === user.uid &&
    Date.now() + TOKEN_SKEW_MS < cachedTokenExpMs
  ) {
    return cachedToken;
  }

  const token = await user.getIdToken(false);
  cachedToken = token || null;
  cachedTokenExpMs = token ? decodeJwtExpMs(token) : 0;
  cachedTokenUid = user.uid;
  return cachedToken;
};

const clearCachedToken = () => {
  cachedToken = null;
  cachedTokenExpMs = 0;
  cachedTokenUid = null;
};

const setCachedToken = (token: string | null, uid: string | null) => {
  if (!token || !uid) {
    clearCachedToken();
    return null;
  }

  cachedToken = token || null;
  cachedTokenExpMs = token ? decodeJwtExpMs(token) : 0;
  cachedTokenUid = uid;
  return token;
};

const resolveAbsoluteApiBase = (): string => {
  const normalizedBase = `${API_BASE_URL || "/api"}`.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(normalizedBase)) {
    return normalizedBase;
  }
  if (typeof window === "undefined") {
    return normalizedBase.startsWith("/") ? normalizedBase : `/${normalizedBase}`;
  }
  const prefixed = normalizedBase.startsWith("/") ? normalizedBase : `/${normalizedBase}`;
  return `${window.location.origin}${prefixed}`;
};

const resolveWebSocketBase = (): string => {
  const apiBase = resolveAbsoluteApiBase();
  if (apiBase.startsWith("https://")) return `wss://${apiBase.slice("https://".length)}`;
  if (apiBase.startsWith("http://")) return `ws://${apiBase.slice("http://".length)}`;
  return apiBase;
};

const buildWebSocketUrl = (path: string, query?: Record<string, string>): string => {
  const wsBase = resolveWebSocketBase().replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = query
    ? Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&")
    : "";
  return `${wsBase}${cleanPath}${queryString ? `?${queryString}` : ""}`;
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
    const uid = auth.currentUser?.uid || null;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      setCachedToken(token, uid);
    } else {
      clearCachedToken();
    }
    return apiFetch<User>("/me", { headers });
  },

  getCandidateProfile: () =>
    apiFetch<CandidateProfile>("/profile/candidate"),

  getCandidateProfileAudit: (params?: { limit?: number; offset?: number }) => {
    const limit = Math.max(1, Math.min(50, Number(params?.limit ?? 20)));
    const offset = Math.max(0, Number(params?.offset ?? 0));
    return apiFetch<CandidateProfileAuditPageResponse>(`/profile/candidate/audit?limit=${limit}&offset=${offset}`);
  },

  getCandidateResumeAnalyses: (params?: { limit?: number; offset?: number }) => {
    const limit = Math.max(1, Math.min(50, Number(params?.limit ?? 20)));
    const offset = Math.max(0, Number(params?.offset ?? 0));
    return apiFetch<ResumeAnalysisPageResponse>(`/profile/candidate/resume-analyses?limit=${limit}&offset=${offset}`);
  },

  getCandidateJobAnalyses: (params?: { limit?: number; offset?: number }) => {
    const limit = Math.max(1, Math.min(50, Number(params?.limit ?? 20)));
    const offset = Math.max(0, Number(params?.offset ?? 0));
    return apiFetch<JobAnalysisPageResponse>(`/profile/candidate/job-analyses?limit=${limit}&offset=${offset}`);
  },

  upsertCandidateProfile: (payload: CandidateProfileUpsertRequest) =>
    apiFetch<CandidateProfile>("/profile/candidate", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  analyzeResume: (payload: {
    fileName: string;
    fileBase64: string;
    mimeType?: string;
    jobDescription?: string;
  }) =>
    apiFetch<ResumeAnalyzeResponse>("/resume/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  analyzeJob: (payload: { jobDescription: string; resumeTechnologies?: string[] }) =>
    apiFetch<JobAnalyzeResponse>("/jobs/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  liveCoachProcess: (payload: {
    audioBase64?: string;
    audioChunks?: Array<{ chunkIndex: number; audio: string; timestamp: string }>;
    mimeType?: string;
    context?: Record<string, unknown>;
  }) =>
    apiFetch<LiveCoachProcessResponse>("/live-coach/process", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  openLiveCoachSocket: async (): Promise<WebSocket> => {
    const token = await getValidAuthToken();
    if (!token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }

    const wsUrl = buildWebSocketUrl("/live-coach/ws", { token });

    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
      };

      const finalize = (ok: boolean, value?: WebSocket, err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        window.clearTimeout(timeoutId);
        if (ok && value) {
          resolve(value);
        } else {
          try {
            ws.close();
          } catch {}
          reject(err || new Error("Falha ao conectar no live coach."));
        }
      };

      const onOpen = () => finalize(true, ws);
      const onError = () => finalize(false, undefined, new Error("Falha ao conectar no live coach."));
      const onClose = () => finalize(false, undefined, new Error("Conexao do live coach encerrada."));

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);

      const timeoutId = window.setTimeout(() => {
        finalize(false, undefined, new Error("Timeout ao conectar no live coach."));
      }, LIVE_COACH_WS_CONNECT_TIMEOUT_MS);
    });
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

  evaluateText: (payload: {
    config: InterviewConfig;
    question: string;
    transcript: string;
    confirmedName?: string;
  }) =>
    apiFetch<AnswerEvaluation>("/ai/evaluate-text", {
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

  orchestratorBuildContext: (payload: {
    config: InterviewConfig;
    resumeText?: string;
    jobDescription?: string;
  }) =>
    apiFetch<OrchestratorContextResponse>("/interview/context", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  orchestratorStart: (payload: {
    config: InterviewConfig;
    resumeText?: string;
    jobDescription?: string;
    includeContext?: boolean;
    difficultyLevel?: number;
  }) =>
    apiFetch<OrchestratorStartResponse>("/interview/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  orchestratorTurn: (payload: {
    config: InterviewConfig;
    sessionId?: string;
    history: any[];
    question: string;
    remainingSeconds: number;
    difficultyLevel?: number;
    confirmedName?: string;
    transcript?: string;
    audioBase64?: string;
    mimeType?: string;
  }) =>
    apiFetch<OrchestratorTurnResponse>("/interview/turn", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  orchestratorFinalize: (payload: { config: InterviewConfig; sessionId?: string; history: any[] }) =>
    apiFetch<OrchestratorFinalizeResponse>("/interview/finalize", {
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

  getSessionAnalysisTrace: (sessionId: string) =>
    apiFetch<SessionAnalysisTraceResponse>(`/sessions/${sessionId}/analysis-trace`),

  devAddCredits: (amount = 3) =>
    apiFetch<{ credits: number }>(`/credits/dev-add?amount=${amount}`, { method: "POST" }),
};
