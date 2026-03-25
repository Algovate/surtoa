const DEFAULT_BASE_URL = process.env.SURTOA_BASE_URL || "https://surtoaapi.zeabur.app";
const DEFAULT_REASONING_EFFORT = "low";

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

function buildSseUrl({ taskId, functionKey, baseUrl }) {
  const url = new URL(`${baseUrl}/v1/function/video/sse`);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("t", String(Date.now()));
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

export function extractVideoInfo(buffer) {
  if (!buffer) return null;

  const htmlMatches = buffer.match(/<video[\s\S]*?<\/video>/gi);
  if (htmlMatches?.length) {
    const lastHtml = htmlMatches[htmlMatches.length - 1];
    const sourceMatch = lastHtml.match(/<source[^>]+src="([^"]+)"/i);
    if (sourceMatch?.[1]) {
      return { url: sourceMatch[1], html: lastHtml };
    }
    const videoMatch = lastHtml.match(/<video[^>]+src="([^"]+)"/i);
    if (videoMatch?.[1]) {
      return { url: videoMatch[1], html: lastHtml };
    }
    return { html: lastHtml };
  }

  const mdMatches = [...buffer.matchAll(/\[video\]\(([^)]+)\)/g)];
  if (mdMatches.length) {
    return { url: mdMatches[mdMatches.length - 1][1] };
  }

  const urlMatches = buffer.match(/https?:\/\/[^\s<)]+/g);
  if (urlMatches?.length) {
    return { url: urlMatches[urlMatches.length - 1] };
  }

  return null;
}

export function parseDeltaProgress(text) {
  const roundMatches = [...text.matchAll(/\[round=(\d+)\/(\d+)\]\s*progress=([0-9]+(?:\.[0-9]+)?)%/g)];
  if (roundMatches.length) {
    const match = roundMatches[roundMatches.length - 1];
    return {
      progress: Math.round(Number.parseFloat(match[3])),
      round: Number.parseInt(match[1], 10),
      roundCount: Number.parseInt(match[2], 10),
    };
  }
  const genericMatches = [...text.matchAll(/progress=([0-9]+(?:\.[0-9]+)?)%/g)];
  if (genericMatches.length) {
    return {
      progress: Math.round(Number.parseFloat(genericMatches[genericMatches.length - 1][1])),
      round: null,
      roundCount: null,
    };
  }
  const zhMatches = [...text.matchAll(/进度\s*(\d+)%/g)];
  if (zhMatches.length) {
    return {
      progress: Number.parseInt(zhMatches[zhMatches.length - 1][1], 10),
      round: null,
      roundCount: null,
    };
  }
  return null;
}

export async function startVideoTask({
  prompt,
  imageUrls,
  aspectRatio,
  videoLength,
  resolutionName,
  preset,
  functionKey,
  debug = false,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const url = `${baseUrl}/v1/function/video/start`;
  debugLog(debug, "POST /v1/function/video/start", {
    prompt,
    imageCount: imageUrls.length,
    aspectRatio,
    videoLength,
    resolutionName,
    preset,
    hasFunctionKey: Boolean(functionKey),
  });
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
        image_urls: imageUrls,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: aspectRatio,
        video_length: videoLength,
        resolution_name: resolutionName,
        preset,
      }),
    });
  } catch (error) {
    throw new Error(formatFetchError(error, url));
  }

  if (!response.ok) {
    const body = await response.text();
    debugLog(debug, "video start failed", response.status, body);
    throw new Error(body || `Failed to create video task (${response.status})`);
  }

  const json = await response.json();
  debugLog(debug, "video start response", json);
  if (!json?.task_id) {
    throw new Error("Missing task_id in video start response");
  }
  return String(json.task_id);
}

export async function stopVideoTasks({ taskIds, functionKey, debug = false, baseUrl = DEFAULT_BASE_URL }) {
  if (!taskIds?.length) return;
  const url = `${baseUrl}/v1/function/video/stop`;
  try {
    debugLog(debug, "POST /v1/function/video/stop", { taskIds });
    await fetch(url, {
      method: "POST",
      headers: {
        ...buildHeaders(functionKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task_ids: taskIds }),
    });
  } catch (error) {
    debugLog(debug, "video stop error", formatFetchError(error, url));
  }
}

export async function streamVideoTask({
  taskId,
  functionKey,
  signal,
  debug = false,
  onEvent,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const url = buildSseUrl({ taskId, functionKey, baseUrl });
  debugLog(debug, "Video SSE connect", url.toString());
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
  } catch (error) {
    throw new Error(formatFetchError(error, url.toString()));
  }

  if (!response.ok || !response.body) {
    throw new Error(`Video SSE stream failed for task ${taskId}`);
  }

  debugLog(debug, "Video SSE open", taskId, response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentBuffer = "";
  let resolvedUrl = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      debugLog(debug, "Video SSE raw chunk", chunk);
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (!dataLines.length) continue;

      const eventData = dataLines.join("\n");
      if (eventData === "[DONE]") {
        debugLog(debug, "Video SSE done", taskId);
        return;
      }

      let payload;
      try {
        payload = JSON.parse(eventData);
      } catch {
        continue;
      }

      if (payload?.error) {
        await Promise.resolve(onEvent({ type: "error", message: payload.error }));
        throw new Error(payload.error);
      }

      const choice = payload?.choices?.[0];
      const deltaContent = choice?.delta?.content || "";
      if (deltaContent) {
        const progressInfo = parseDeltaProgress(deltaContent);
        if (progressInfo !== null) {
          await Promise.resolve(onEvent({ type: "progress", ...progressInfo }));
        }
        if (deltaContent.includes("超分辨率") || deltaContent.toLowerCase().includes("super resolution")) {
          await Promise.resolve(onEvent({ type: "status", message: "super resolution in progress" }));
        }

        contentBuffer += deltaContent;
        const info = extractVideoInfo(contentBuffer);
        if (info?.url && info.url !== resolvedUrl) {
          resolvedUrl = info.url;
          await Promise.resolve(onEvent({ type: "resolved", url: resolvedUrl, html: info.html || "" }));
        }
      }

      if (choice?.finish_reason === "stop") {
        debugLog(debug, "Video SSE finish_reason=stop", taskId);
        return;
      }
    }
  }
}
