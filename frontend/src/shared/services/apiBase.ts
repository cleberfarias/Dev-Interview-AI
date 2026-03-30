const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(:\d+)?(\/|$)/i;

export const resolveApiBaseUrl = (configuredBase?: string): string => {
  const rawBase = `${configuredBase || "/api"}`.trim() || "/api";

  if (typeof window === "undefined") {
    return rawBase;
  }

  const pageHostname = window.location.hostname || "";
  const pageIsLocal =
    pageHostname === "localhost" ||
    pageHostname === "127.0.0.1" ||
    pageHostname === "0.0.0.0";

  if (!pageIsLocal && LOCALHOST_PATTERN.test(rawBase)) {
    return "/api";
  }

  return rawBase;
};
