const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "/api";
const TELEMETRY_ENABLED =
  ((import.meta as any).env?.VITE_CLIENT_TELEMETRY_ENABLED ?? "true") !== "false";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 16000;
const MAX_COMPONENT_STACK_LENGTH = 8000;
const MAX_URL_LENGTH = 4096;
const MAX_PATH_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 1024;
const MAX_METADATA_STRING_LENGTH = 2000;
const DEDUPE_WINDOW_MS = 15000;

type ClientTelemetryLevel = "info" | "warning" | "error";
type ClientTelemetrySource = "web" | "android" | "ios";

type ClientTelemetryPayload = {
  level?: ClientTelemetryLevel;
  kind: string;
  message: string;
  stack?: string;
  componentStack?: string;
  path?: string;
  url?: string;
  source?: ClientTelemetrySource;
  sessionId?: string;
  userAgent?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

let installed = false;
let lastFingerprint = "";
let lastSentAt = 0;

const truncate = (value: string | null | undefined, max: number): string | undefined => {
  if (!value) return undefined;
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}...`;
};

const safeStringify = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const sanitizeMetadata = (
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!metadata) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) continue;
    if (typeof value === "string") {
      sanitized[key] = truncate(value, MAX_METADATA_STRING_LENGTH);
      continue;
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      Array.isArray(value) ||
      typeof value === "object"
    ) {
      sanitized[key] = value;
      continue;
    }
    sanitized[key] = truncate(String(value), MAX_METADATA_STRING_LENGTH);
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
};

const resolveTelemetryUrl = (): string => {
  const base = `${API_BASE_URL || "/api"}`.replace(/\/+$/, "");
  const suffix = "/telemetry/client-error";
  if (/^https?:\/\//i.test(base)) {
    return `${base}${suffix}`;
  }
  if (typeof window === "undefined") {
    return `${base.startsWith("/") ? base : `/${base}`}${suffix}`;
  }
  const prefixed = base.startsWith("/") ? base : `/${base}`;
  return `${window.location.origin}${prefixed}${suffix}`;
};

const resolveSource = (): ClientTelemetrySource => {
  if (typeof window === "undefined") return "web";
  const platform = (
    window as typeof window & { Capacitor?: { getPlatform?: () => string } }
  ).Capacitor?.getPlatform?.();
  if (platform === "android" || platform === "ios") {
    return platform;
  }
  return "web";
};

const shouldSkipEvent = (payload: ClientTelemetryPayload): boolean => {
  const fingerprint = [
    payload.kind,
    payload.message,
    payload.path || "",
    payload.componentStack || payload.stack || "",
  ].join("|");
  const now = Date.now();
  if (fingerprint === lastFingerprint && now - lastSentAt < DEDUPE_WINDOW_MS) {
    return true;
  }
  lastFingerprint = fingerprint;
  lastSentAt = now;
  return false;
};

const sendWithBeacon = (url: string, payload: ClientTelemetryPayload): boolean => {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
};

const buildPayload = (input: ClientTelemetryPayload): ClientTelemetryPayload => ({
  level: input.level || "error",
  kind: truncate(input.kind, 64) || "unknown",
  message: truncate(input.message, MAX_MESSAGE_LENGTH) || "Unknown client error",
  stack: truncate(input.stack, MAX_STACK_LENGTH),
  componentStack: truncate(input.componentStack, MAX_COMPONENT_STACK_LENGTH),
  path: truncate(input.path || (typeof window !== "undefined" ? window.location.pathname : ""), MAX_PATH_LENGTH),
  url: truncate(input.url || (typeof window !== "undefined" ? window.location.href : ""), MAX_URL_LENGTH),
  source: input.source || resolveSource(),
  sessionId: truncate(input.sessionId, 128),
  userAgent: truncate(
    input.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : ""),
    MAX_USER_AGENT_LENGTH,
  ),
  timestamp: input.timestamp || new Date().toISOString(),
  metadata: sanitizeMetadata(input.metadata),
});

const normalizeUnknownError = (
  reason: unknown,
): Pick<ClientTelemetryPayload, "message" | "stack" | "metadata"> => {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name || "Unhandled client exception",
      stack: reason.stack,
      metadata: reason.name ? { name: reason.name } : undefined,
    };
  }

  if (typeof reason === "string") {
    return { message: reason };
  }

  return {
    message: "Unhandled client exception",
    metadata: {
      reason: truncate(safeStringify(reason), MAX_METADATA_STRING_LENGTH),
      reasonType: typeof reason,
    },
  };
};

export const reportClientError = (input: ClientTelemetryPayload): void => {
  if (!TELEMETRY_ENABLED || typeof window === "undefined") return;

  const payload = buildPayload(input);
  if (shouldSkipEvent(payload)) return;

  const url = resolveTelemetryUrl();
  if (document.visibilityState === "hidden" && sendWithBeacon(url, payload)) {
    return;
  }

  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "include",
  }).catch(() => null);
};

export const installGlobalClientTelemetry = (): void => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const details = normalizeUnknownError(event.error || event.message);
    reportClientError({
      kind: "window.error",
      message: details.message,
      stack: details.stack,
      metadata: {
        ...(details.metadata || {}),
        column: event.colno,
        fileName: event.filename,
        line: event.lineno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const details = normalizeUnknownError(event.reason);
    reportClientError({
      kind: "window.unhandledrejection",
      message: details.message,
      stack: details.stack,
      metadata: details.metadata,
    });
  });
};
