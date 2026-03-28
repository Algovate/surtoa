import type { VideoProgressInfo, VideoResolvedInfo, VideoStreamEvent } from "../shared/types.js";
import { buildHeaders, debugLog, DEFAULT_BASE_URL, formatFetchError } from "./shared.js";

const DEFAULT_REASONING_EFFORT = "low";

function buildSseUrl({
  taskId,
  functionKey,
  baseUrl,
}: {
  taskId: string;
  functionKey?: string;
  baseUrl: string;
}): URL {
  const url = new URL(`${baseUrl}/v1/function/video/sse`);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("t", String(Date.now()));
  if (functionKey) {
    url.searchParams.set("function_key", functionKey);
  }
  return url;
}

export function extractVideoInfo(buffer: string): VideoResolvedInfo | null {
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
    return { url: mdMatches[mdMatches.length - 1]?.[1] };
  }

  const urlMatches = buffer.match(/https?:\/\/[^\s<)]+/g);
  if (urlMatches?.length) {
    return { url: urlMatches[urlMatches.length - 1] };
  }

  return null;
}

export function parseDeltaProgress(text: string): VideoProgressInfo | null {
  const roundMatches = [...text.matchAll(/\[round=(\d+)\/(\d+)\]\s*progress=([0-9]+(?:\.[0-9]+)?)%/g)];
  if (roundMatches.length) {
    const match = roundMatches[roundMatches.length - 1];
    if (!match) return null;
    return {
      progress: Math.round(Number.parseFloat(match[3])),
      round: Number.parseInt(match[1], 10),
      roundCount: Number.parseInt(match[2], 10),
    };
  }
  const genericMatches = [...text.matchAll(/progress=([0-9]+(?:\.[0-9]+)?)%/g)];
  if (genericMatches.length) {
    const match = genericMatches[genericMatches.length - 1];
    if (!match) return null;
    return {
      progress: Math.round(Number.parseFloat(match[1])),
      round: null,
      roundCount: null,
    };
  }
  const zhMatches = [...text.matchAll(/进度\s*(\d+)%/g)];
  if (zhMatches.length) {
    const match = zhMatches[zhMatches.length - 1];
    if (!match) return null;
    return {
      progress: Number.parseInt(match[1], 10),
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
}: {
  prompt: string;
  imageUrls: string[];
  aspectRatio: string;
  videoLength: number;
  resolutionName: string;
  preset: string;
  functionKey?: string;
  debug?: boolean;
  baseUrl?: string;
}): Promise<string> {
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
        image_urls: imageUrls,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: aspectRatio,
        video_length: videoLength,
        resolution_name: resolutionName,
        preset,
      }),
    });
  } catch (error: unknown) {
    throw new Error(formatFetchError(error, url));
  }

  if (!response.ok) {
    const body = await response.text();
    debugLog(debug, "video start failed", response.status, body);
    throw new Error(body || `Failed to create video task (${response.status})`);
  }

  const json = (await response.json()) as unknown;
  if (!json || typeof json !== "object" || !("task_id" in json) || typeof json.task_id !== "string") {
    debugLog(debug, "video start response", json);
    throw new Error("Missing task_id in video start response");
  }
  debugLog(debug, "video start response", json);
  return String(json.task_id);
}

export async function stopVideoTasks({
  taskIds,
  functionKey,
  debug = false,
  baseUrl = DEFAULT_BASE_URL,
}: {
  taskIds: string[];
  functionKey?: string;
  debug?: boolean;
  baseUrl?: string;
}): Promise<void> {
  if (!taskIds.length) return;
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
  } catch (error: unknown) {
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
}: {
  taskId: string;
  functionKey?: string;
  signal?: AbortSignal;
  debug?: boolean;
  onEvent: (event: VideoStreamEvent) => void | Promise<void>;
  baseUrl?: string;
}): Promise<void> {
  const url = buildSseUrl({ taskId, functionKey, baseUrl });
  debugLog(debug, "Video SSE connect", url.toString());
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
  } catch (error: unknown) {
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

      let payload: unknown;
      try {
        payload = JSON.parse(eventData) as unknown;
      } catch {
        continue;
      }
      if (!payload || typeof payload !== "object") {
        continue;
      }

      if ("error" in payload && typeof payload.error === "string") {
        await Promise.resolve(onEvent({ type: "error", message: payload.error }));
        throw new Error(payload.error);
      }

      const choice =
        "choices" in payload && Array.isArray(payload.choices)
          ? payload.choices[0]
          : undefined;
      const delta =
        choice && typeof choice === "object" && "delta" in choice && choice.delta && typeof choice.delta === "object"
          ? choice.delta
          : undefined;
      const deltaContent =
        delta && "content" in delta && typeof delta.content === "string" ? delta.content : "";

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

      const finishReason =
        choice && typeof choice === "object" && "finish_reason" in choice && typeof choice.finish_reason === "string"
          ? choice.finish_reason
          : null;
      if (finishReason === "stop") {
        debugLog(debug, "Video SSE finish_reason=stop", taskId);
        return;
      }
    }
  }
}
