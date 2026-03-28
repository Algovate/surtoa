export const DEFAULT_BASE_URL = process.env.SURTOA_BASE_URL || "https://surtoaapi.zeabur.app";

export function buildHeaders(functionKey?: string): Record<string, string> {
  return functionKey ? { Authorization: `Bearer ${functionKey}` } : {};
}

export function debugLog(debug: boolean, ...args: unknown[]): void {
  if (debug) {
    console.error("[debug]", ...args);
  }
}

export function formatFetchError(error: unknown, url: string): string {
  if (!(error instanceof Error)) {
    return `Request failed for ${url}: ${String(error)}`;
  }

  const details: string[] = [];
  if (error.message) {
    details.push(error.message);
  }

  const cause = error.cause;
  if (cause) {
    if (typeof cause === "object") {
      if ("code" in cause && typeof cause.code === "string") {
        details.push(`cause=${cause.code}`);
      }
      if ("message" in cause && typeof cause.message === "string") {
        details.push(`detail=${cause.message}`);
      }
    } else {
      details.push(`cause=${String(cause)}`);
    }
  }

  return `Request failed for ${url}: ${details.join(" | ") || "unknown fetch error"}`;
}
