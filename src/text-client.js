const DEFAULT_BASE_URL = process.env.SURTOA_BASE_URL || "https://surtoaapi.zeabur.app";
const CHAT_COMPLETIONS_ENDPOINT = "/v1/function/chat/completions";

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
}) {
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

  let response;
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
  } catch (error) {
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
        let payloadJson;
        try {
          payloadJson = JSON.parse(eventData);
        } catch {
          continue;
        }

        const delta = payloadJson?.choices?.[0]?.delta?.content ?? "";
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
