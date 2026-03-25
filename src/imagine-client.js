const DEFAULT_BASE_URL = process.env.SURTOA_BASE_URL || "https://surtoaapi.zeabur.app";
const WS_OPEN_TIMEOUT_MS = 1500;

function buildHeaders(functionKey) {
  return functionKey ? { Authorization: `Bearer ${functionKey}` } : {};
}

function normalizeMessage(rawMessage, taskId) {
  if (!rawMessage || typeof rawMessage !== "object") {
    return null;
  }

  if (rawMessage.type === "image_generation.partial_image" || rawMessage.type === "image_generation.completed") {
    return {
      type: rawMessage.type === "image_generation.completed" || rawMessage.stage === "final" ? "final" : "partial",
      taskId,
      imageId: rawMessage.image_id || rawMessage.imageId || null,
      payload: rawMessage.b64_json || rawMessage.url || rawMessage.image || null,
      elapsedMs: rawMessage.elapsed_ms ?? null,
      raw: rawMessage,
    };
  }

  if (rawMessage.type === "image") {
    return {
      type: "final",
      taskId,
      imageId: rawMessage.image_id || rawMessage.imageId || `legacy-${Date.now()}`,
      payload: rawMessage.b64_json || rawMessage.url || rawMessage.image || null,
      elapsedMs: rawMessage.elapsed_ms ?? null,
      raw: rawMessage,
    };
  }

  if (rawMessage.type === "status") {
    return {
      type: "status",
      taskId,
      status: rawMessage.status || "unknown",
      runId: rawMessage.run_id || null,
      raw: rawMessage,
    };
  }

  if (rawMessage.type === "error" || rawMessage.error) {
    return {
      type: "error",
      taskId,
      imageId: rawMessage.image_id || rawMessage.imageId || null,
      message:
        rawMessage.message ||
        rawMessage.error?.message ||
        rawMessage.error ||
        "Unknown imagine error",
      raw: rawMessage,
    };
  }

  return null;
}

function parseJsonSafely(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  if (error.message) {
    details.push(error.message);
  }

  const cause = error.cause;
  if (cause) {
    if (typeof cause === "object") {
      const causeCode = "code" in cause ? cause.code : undefined;
      const causeMessage = "message" in cause ? cause.message : undefined;
      if (causeCode) {
        details.push(`cause=${causeCode}`);
      }
      if (causeMessage) {
        details.push(`detail=${causeMessage}`);
      }
    } else {
      details.push(`cause=${String(cause)}`);
    }
  }

  return `Request failed for ${url}: ${details.join(" | ") || "unknown fetch error"}`;
}

async function readSocketMessageData(data) {
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
}) {
  const url = `${baseUrl}/v1/function/imagine/start`;
  debugLog(debug, "POST /v1/function/imagine/start", { prompt, aspectRatio, nsfw, hasFunctionKey: Boolean(functionKey) });
  let response;
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
  } catch (error) {
    debugLog(debug, "start fetch error", error);
    throw new Error(formatFetchError(error, url));
  }

  if (!response.ok) {
    const body = await response.text();
    debugLog(debug, "start failed", response.status, body);
    throw new Error(body || `Failed to create task (${response.status})`);
  }

  const json = await response.json();
  debugLog(debug, "start response", json);
  if (!json?.task_id) {
    throw new Error("Missing task_id in imagine start response");
  }

  return String(json.task_id);
}

export async function stopTasks({ taskIds, functionKey, baseUrl = DEFAULT_BASE_URL, debug = false }) {
  if (!taskIds?.length) {
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
  } catch (error) {
    debugLog(debug, "stop fetch error", formatFetchError(error, url));
    // Best effort cleanup.
  }
}

function buildWsUrl({ taskId, functionKey, baseUrl }) {
  const url = new URL(`${baseUrl}/v1/function/imagine/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("task_id", taskId);
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

function buildSseUrl({ taskId, functionKey, baseUrl }) {
  const url = new URL(`${baseUrl}/v1/function/imagine/sse`);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("t", String(Date.now()));
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

async function streamViaWebSocket({ taskId, functionKey, baseUrl, onMessage, signal, startPayload, debug }) {
  return new Promise((resolve, reject) => {
    const wsUrl = buildWsUrl({ taskId, functionKey, baseUrl });
    debugLog(debug, "WS connect", wsUrl.toString());
    const ws = new WebSocket(wsUrl);
    let settled = false;
    let open = false;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    const finish = (fn, value) => {
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
      fn(value);
    };

    const abortHandler = () => finish(resolve);
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const timer = setTimeout(() => {
      if (!open && !settled) {
        debugLog(debug, "WS open timeout", taskId);
        finish(reject, new Error("WS_OPEN_TIMEOUT"));
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

    ws.addEventListener("message", async (event) => {
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
        finish(resolve);
      } else if (normalized.type === "error") {
        finish(reject, new Error(normalized.message));
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      debugLog(debug, "WS error", taskId);
      if (!open) {
        finish(reject, new Error("WS_CONNECTION_ERROR"));
        return;
      }
      finish(reject, new Error(`WebSocket stream failed for task ${taskId}`));
    });

    ws.addEventListener("close", () => {
      clearTimeout(timer);
      debugLog(debug, "WS close", taskId);
      if (!settled) {
        finish(resolve);
      }
    });
  });
}

async function streamViaSse({ taskId, functionKey, baseUrl, onMessage, signal, debug }) {
  const sseUrl = buildSseUrl({ taskId, functionKey, baseUrl });
  debugLog(debug, "SSE connect", sseUrl.toString());
  let response;
  try {
    response = await fetch(sseUrl, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
  } catch (error) {
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
}) {
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
  } catch (error) {
    if (error instanceof Error && (error.message === "WS_OPEN_TIMEOUT" || error.message === "WS_CONNECTION_ERROR")) {
      debugLog(debug, "Auto fallback to SSE", taskId, error.message);
      await streamViaSse({ taskId, functionKey, baseUrl, onMessage, signal, debug });
      return;
    }
    throw error;
  }
}
