import type { TextCompletionChunk, TextCompletionOptions } from "../shared/types.js";
import { buildHeaders, debugLog, DEFAULT_BASE_URL, formatFetchError } from "./shared.js";

const CHAT_COMPLETIONS_ENDPOINT = "/v1/function/chat/completions";

function isTextCompletionChunk(value: unknown): value is TextCompletionChunk {
  return typeof value === "object" && value !== null;
}

export async function startTextCompletion({
  model,
  messages,
  temperature,
  topP,
  functionKey,
  debug = false,
  signal,
  onDelta,
  baseUrl = DEFAULT_BASE_URL,
}: TextCompletionOptions): Promise<string> {
  const url = `${baseUrl}${CHAT_COMPLETIONS_ENDPOINT}`;
  const payload = {
    model,
    messages,
    stream: true,
    temperature,
    top_p: topP,
  };

  debugLog(debug, "POST /v1/function/chat/completions", {
    model,
    messageCount: messages.length,
    temperature,
    topP,
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
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error: unknown) {
    throw new Error(formatFetchError(error, url));
  }

  if (!response.ok || !response.body) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // ignore
    }
    throw new Error(body || `Chat completion failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let output = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const eventData = trimmed.slice(5).trim();
        if (!eventData) continue;
        if (eventData === "[DONE]") {
          debugLog(debug, "Chat completion done");
          return output;
        }
        debugLog(debug, "Chat raw chunk", eventData);
        let payloadJson: unknown;
        try {
          payloadJson = JSON.parse(eventData) as unknown;
        } catch {
          continue;
        }
        if (!isTextCompletionChunk(payloadJson)) {
          continue;
        }

        const delta = payloadJson.choices?.[0]?.delta?.content ?? "";
        if (!delta) {
          continue;
        }
        output += delta;
        await Promise.resolve(onDelta?.(delta));
      }
    }
  }

  return output;
}
