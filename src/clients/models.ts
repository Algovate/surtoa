import type { ModelItem, ModelsPayload } from "../shared/types.js";
import { buildHeaders, debugLog, DEFAULT_BASE_URL, formatFetchError } from "./shared.js";

const MODELS_ENDPOINT = "/v1/models";

function isModelsPayload(value: unknown): value is ModelsPayload {
  return typeof value === "object" && value !== null;
}

export async function listModels({
  functionKey,
  debug = false,
  baseUrl = DEFAULT_BASE_URL,
}: {
  functionKey?: string;
  debug?: boolean;
  baseUrl?: string;
}): Promise<{ payload: ModelsPayload | null; items: ModelItem[] }> {
  const url = `${baseUrl}${MODELS_ENDPOINT}`;
  debugLog(debug, "GET /v1/models", { hasFunctionKey: Boolean(functionKey) });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(functionKey),
    });
  } catch (error: unknown) {
    throw new Error(formatFetchError(error, url));
  }

  let payload: ModelsPayload | null;
  try {
    const json = (await response.json()) as unknown;
    payload = isModelsPayload(json) ? json : null;
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
