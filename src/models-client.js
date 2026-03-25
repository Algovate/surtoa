const DEFAULT_BASE_URL = process.env.SURTOA_BASE_URL || "https://surtoaapi.zeabur.app";
const MODELS_ENDPOINT = "/v1/models";

function buildHeaders(functionKey) {
  return functionKey ? { Authorization: `Bearer ${functionKey}` } : {};
}

function debugLog(debug, ...args) {
  if (debug) {
    console.error("[debug]", ...args);
  }
}

function formatFetchError(error, url) {
  if (!(error instanceof Error)) {
    return `Request failed for ${url}: ${String(error)}`;
  }
  const details = [];
  if (error.message) details.push(error.message);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    if ("code" in cause && cause.code) details.push(`cause=${cause.code}`);
    if ("message" in cause && cause.message) details.push(`detail=${cause.message}`);
  }
  return `Request failed for ${url}: ${details.join(" | ") || "unknown fetch error"}`;
}

export async function listModels({
  functionKey,
  debug = false,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const url = `${baseUrl}${MODELS_ENDPOINT}`;
  debugLog(debug, "GET /v1/models", { hasFunctionKey: Boolean(functionKey) });

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(functionKey),
    });
  } catch (error) {
    throw new Error(formatFetchError(error, url));
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Model listing failed with status ${response.status}`;
    throw new Error(message);
  }

  const items = Array.isArray(payload?.data) ? payload.data : [];
  return { payload, items };
}
