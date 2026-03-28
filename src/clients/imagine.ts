import type { NormalizedImageMessage, StartTaskPayload, StreamTaskMode } from "../shared/types.js";
import { buildHeaders, debugLog, DEFAULT_BASE_URL, formatFetchError } from "./shared.js";

const WS_OPEN_TIMEOUT_MS = 1500;

function normalizeMessage(rawMessage: unknown, taskId: string): NormalizedImageMessage | null {
  if (!rawMessage || typeof rawMessage !== "object") {
    return null;
  }

  const message = rawMessage as Record<string, unknown>;
  const type = typeof message.type === "string" ? message.type : undefined;
  const stage = typeof message.stage === "string" ? message.stage : undefined;
  const imageId =
    typeof message.image_id === "string"
      ? message.image_id
      : typeof message.imageId === "string"
        ? message.imageId
        : null;
  const payload =
    typeof message.b64_json === "string"
      ? message.b64_json
      : typeof message.url === "string"
        ? message.url
        : typeof message.image === "string"
          ? message.image
          : null;
  const elapsedMs = typeof message.elapsed_ms === "number" ? message.elapsed_ms : null;

  if (type === "image_generation.partial_image" || type === "image_generation.completed") {
    return {
      type: type === "image_generation.completed" || stage === "final" ? "final" : "partial",
      taskId,
      imageId,
      payload,
      elapsedMs,
      raw: rawMessage,
    };
  }

  if (type === "image") {
    return {
      type: "final",
      taskId,
      imageId: imageId || `legacy-${Date.now()}`,
      payload,
      elapsedMs,
      raw: rawMessage,
    };
  }

  if (type === "status") {
    return {
      type: "status",
      taskId,
      status: typeof message.status === "string" ? message.status : "unknown",
      runId: typeof message.run_id === "string" ? message.run_id : null,
      raw: rawMessage,
    };
  }

  const errorValue = message.error;
  if (type === "error" || errorValue) {
    const nestedErrorMessage =
      errorValue && typeof errorValue === "object" && "message" in errorValue && typeof errorValue.message === "string"
        ? errorValue.message
        : typeof errorValue === "string"
          ? errorValue
          : null;
    return {
      type: "error",
      taskId,
      imageId,
      message:
        (typeof message.message === "string" ? message.message : null) ||
        nestedErrorMessage ||
        "Unknown imagine error",
      raw: rawMessage,
    };
  }

  return null;
}

function parseJsonSafely(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}


async function readSocketMessageData(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  return String(data);
}

export async function startTask({
  prompt,
  aspectRatio,
  nsfw,
  functionKey,
  baseUrl = DEFAULT_BASE_URL,
  debug = false,
}: {
  prompt: string;
  aspectRatio: string;
  nsfw: boolean;
  functionKey?: string;
  baseUrl?: string;
  debug?: boolean;
}): Promise<string> {
  const url = `${baseUrl}/v1/function/imagine/start`;
  debugLog(debug, "POST /v1/function/imagine/start", { prompt, aspectRatio, nsfw, hasFunctionKey: Boolean(functionKey) });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...buildHeaders(functionKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        nsfw,
      }),
    });
  } catch (error: unknown) {
    debugLog(debug, "start fetch error", error);
    throw new Error(formatFetchError(error, url));
  }

  if (!response.ok) {
    const body = await response.text();
    debugLog(debug, "start failed", response.status, body);
    throw new Error(body || `Failed to create task (${response.status})`);
  }

  const json = (await response.json()) as unknown;
  debugLog(debug, "start response", json);
  if (!json || typeof json !== "object" || !("task_id" in json)) {
    throw new Error("Missing task_id in imagine start response");
  }

  return String(json.task_id);
}

export async function stopTasks({
  taskIds,
  functionKey,
  baseUrl = DEFAULT_BASE_URL,
  debug = false,
}: {
  taskIds: string[];
  functionKey?: string;
  baseUrl?: string;
  debug?: boolean;
}): Promise<void> {
  if (!taskIds.length) {
    return;
  }

  const url = `${baseUrl}/v1/function/imagine/stop`;
  try {
    debugLog(debug, "POST /v1/function/imagine/stop", { taskIds });
    await fetch(url, {
      method: "POST",
      headers: {
        ...buildHeaders(functionKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task_ids: taskIds }),
    });
  } catch (error: unknown) {
    debugLog(debug, "stop fetch error", formatFetchError(error, url));
  }
}

function buildWsUrl({
  taskId,
  functionKey,
  baseUrl,
}: {
  taskId: string;
  functionKey?: string;
  baseUrl: string;
}): URL {
  const url = new URL(`${baseUrl}/v1/function/imagine/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("task_id", taskId);
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

function buildSseUrl({
  taskId,
  functionKey,
  baseUrl,
}: {
  taskId: string;
  functionKey?: string;
  baseUrl: string;
}): URL {
  const url = new URL(`${baseUrl}/v1/function/imagine/sse`);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("t", String(Date.now()));
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

async function streamViaWebSocket({
  taskId,
  functionKey,
  baseUrl,
  onMessage,
  signal,
  startPayload,
  debug,
}: {
  taskId: string;
  functionKey?: string;
  baseUrl: string;
  onMessage: (message: NormalizedImageMessage) => void | Promise<void>;
  signal?: AbortSignal;
  startPayload?: StartTaskPayload;
  debug: boolean;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = buildWsUrl({ taskId, functionKey, baseUrl });
    debugLog(debug, "WS connect", wsUrl.toString());
    const ws = new WebSocket(wsUrl);
    let settled = false;
    let open = false;

    const cleanup = (): void => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    const finishResolve = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve();
    };

    const finishReject = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(error);
    };

    const abortHandler = (): void => finishResolve();
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const timer = setTimeout(() => {
      if (!open && !settled) {
        debugLog(debug, "WS open timeout", taskId);
        finishReject(new Error("WS_OPEN_TIMEOUT"));
      }
    }, WS_OPEN_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      open = true;
      clearTimeout(timer);
      debugLog(debug, "WS open", taskId);
      if (startPayload) {
        debugLog(debug, "WS send start", {
          taskId,
          prompt: startPayload.prompt,
          aspectRatio: startPayload.aspectRatio,
          nsfw: startPayload.nsfw,
        });
        ws.send(
          JSON.stringify({
            type: "start",
            prompt: startPayload.prompt,
            aspect_ratio: startPayload.aspectRatio,
            nsfw: startPayload.nsfw,
          }),
        );
      }
    });

    ws.addEventListener("message", (event) => {
      void (async () => {
        const raw = await readSocketMessageData(event.data);
        debugLog(debug, "WS raw message", raw);
        const payload = parseJsonSafely(raw);
        const normalized = normalizeMessage(payload, taskId);
        if (!normalized) {
          debugLog(debug, "WS message ignored", taskId);
          return;
        }
        debugLog(debug, "WS normalized", normalized);
        await Promise.resolve(onMessage(normalized));
        if (
          normalized.type === "final" ||
          (normalized.type === "status" && normalized.status === "stopped")
        ) {
          finishResolve();
        } else if (normalized.type === "error") {
          finishReject(new Error(normalized.message));
        }
      })().catch((error: unknown) => {
        finishReject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      debugLog(debug, "WS error", taskId);
      if (!open) {
        finishReject(new Error("WS_CONNECTION_ERROR"));
        return;
      }
      finishReject(new Error(`WebSocket stream failed for task ${taskId}`));
    });

    ws.addEventListener("close", () => {
      clearTimeout(timer);
      debugLog(debug, "WS close", taskId);
      if (!settled) {
        finishResolve();
      }
    });
  });
}

async function streamViaSse({
  taskId,
  functionKey,
  baseUrl,
  onMessage,
  signal,
  debug,
}: {
  taskId: string;
  functionKey?: string;
  baseUrl: string;
  onMessage: (message: NormalizedImageMessage) => void | Promise<void>;
  signal?: AbortSignal;
  debug: boolean;
}): Promise<void> {
  const sseUrl = buildSseUrl({ taskId, functionKey, baseUrl });
  debugLog(debug, "SSE connect", sseUrl.toString());
  let response: Response;
  try {
    response = await fetch(sseUrl, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
  } catch (error: unknown) {
    throw new Error(formatFetchError(error, sseUrl.toString()));
  }

  if (!response.ok || !response.body) {
    debugLog(debug, "SSE failed", taskId, response.status, response.statusText);
    throw new Error(`SSE stream failed for task ${taskId}`);
  }

  debugLog(debug, "SSE open", taskId, response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      debugLog(debug, "SSE raw chunk", chunk);
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (!dataLines.length) {
        continue;
      }

      const payload = parseJsonSafely(dataLines.join("\n"));
      const normalized = normalizeMessage(payload, taskId);
      if (!normalized) {
        debugLog(debug, "SSE message ignored", taskId);
        continue;
      }

      debugLog(debug, "SSE normalized", normalized);
      await Promise.resolve(onMessage(normalized));
      if (normalized.type === "final" || (normalized.type === "status" && normalized.status === "stopped")) {
        return;
      }
      if (normalized.type === "error") {
        throw new Error(normalized.message);
      }
    }
  }
}

export async function streamTask({
  taskId,
  mode,
  functionKey,
  onMessage,
  signal,
  startPayload,
  debug = false,
  baseUrl = DEFAULT_BASE_URL,
}: {
  taskId: string;
  mode: StreamTaskMode;
  functionKey?: string;
  onMessage: (message: NormalizedImageMessage) => void | Promise<void>;
  signal?: AbortSignal;
  startPayload?: StartTaskPayload;
  debug?: boolean;
  baseUrl?: string;
}): Promise<void> {
  if (mode === "ws") {
    await streamViaWebSocket({ taskId, functionKey, baseUrl, onMessage, signal, startPayload, debug });
    return;
  }

  if (mode === "sse") {
    await streamViaSse({ taskId, functionKey, baseUrl, onMessage, signal, debug });
    return;
  }

  try {
    await streamViaWebSocket({ taskId, functionKey, baseUrl, onMessage, signal, startPayload, debug });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === "WS_OPEN_TIMEOUT" || error.message === "WS_CONNECTION_ERROR")) {
      debugLog(debug, "Auto fallback to SSE", taskId, error.message);
      await streamViaSse({ taskId, functionKey, baseUrl, onMessage, signal, debug });
      return;
    }
    throw error;
  }
}
