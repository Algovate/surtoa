import { parseArgs } from "node:util";

const IMAGE_RATIOS = new Set(["2:3", "1:1", "3:2", "16:9", "9:16"]);
const IMAGE_MODES = new Set(["auto", "ws", "sse"]);
const VIDEO_RATIOS = new Set(["3:2", "2:3", "16:9", "9:16", "1:1"]);
const VIDEO_RESOLUTIONS = new Set(["480p", "720p"]);
const VIDEO_PRESETS = new Set(["normal", "fun", "spicy", "custom"]);
const MAX_VIDEO_REFERENCES = 7;
const DEFAULT_TEXT_MODEL = "grok-4.20-beta";

function parseBoolean(value, flagName) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flagName} must be true or false`);
}

function parseCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    throw new Error("--count must be an integer from 1 to 3");
  }
  return parsed;
}

function parseVideoLength(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 6 || parsed > 30) {
    throw new Error("--length must be an integer from 6 to 30");
  }
  return parsed;
}

function parseFloatRange(value, flagName, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flagName} must be a number from ${min} to ${max}`);
  }
  return parsed;
}

function normalizeList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseImageGenerateArgs(rest) {
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      prompt: { type: "string" },
      ratio: { type: "string", default: "2:3" },
      count: { type: "string", default: "1" },
      nsfw: { type: "string", default: "true" },
      out: { type: "string", default: "./output" },
      "function-key": { type: "string" },
      mode: { type: "string", default: "auto" },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true, topic: "image" };
  }
  if (!values.prompt?.trim()) {
    throw new Error("--prompt is required");
  }
  if (!IMAGE_RATIOS.has(values.ratio)) {
    throw new Error("--ratio must be one of 2:3, 1:1, 3:2, 16:9, 9:16");
  }
  if (!IMAGE_MODES.has(values.mode)) {
    throw new Error("--mode must be one of auto, ws, sse");
  }

  return {
    kind: "image",
    command: "image generate",
    prompt: values.prompt.trim(),
    ratio: values.ratio,
    count: parseCount(values.count),
    nsfw: parseBoolean(values.nsfw, "--nsfw"),
    out: values.out,
    functionKey: values["function-key"] || "",
    mode: values.mode,
    partialSave: false,
    debug: values.debug,
  };
}

function parseVideoGenerateArgs(rest) {
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      prompt: { type: "string" },
      ratio: { type: "string", default: "3:2" },
      length: { type: "string", default: "6" },
      resolution: { type: "string", default: "480p" },
      preset: { type: "string", default: "normal" },
      out: { type: "string", default: "./output" },
      "function-key": { type: "string" },
      "image-url": { type: "string", multiple: true },
      "image-file": { type: "string", multiple: true },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true, topic: "video" };
  }
  if (!values.prompt?.trim()) {
    throw new Error("--prompt is required");
  }
  if (!VIDEO_RATIOS.has(values.ratio)) {
    throw new Error("--ratio must be one of 3:2, 2:3, 16:9, 9:16, 1:1");
  }
  if (!VIDEO_RESOLUTIONS.has(values.resolution)) {
    throw new Error("--resolution must be one of 480p, 720p");
  }
  if (!VIDEO_PRESETS.has(values.preset)) {
    throw new Error("--preset must be one of normal, fun, spicy, custom");
  }

  const imageUrls = normalizeList(values["image-url"]);
  const imageFiles = normalizeList(values["image-file"]);
  if (imageUrls.length && imageFiles.length) {
    throw new Error("--image-url and --image-file cannot be used together");
  }
  if (imageUrls.length > MAX_VIDEO_REFERENCES || imageFiles.length > MAX_VIDEO_REFERENCES) {
    throw new Error("--image-url/--image-file supports at most 7 items");
  }

  return {
    kind: "video",
    command: "video generate",
    prompt: values.prompt.trim(),
    ratio: values.ratio,
    length: parseVideoLength(values.length),
    resolution: values.resolution,
    preset: values.preset,
    out: values.out,
    functionKey: values["function-key"] || "",
    imageUrls,
    imageFiles,
    debug: values.debug,
  };
}

function parseTextGenerateArgs(rest) {
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      prompt: { type: "string" },
      model: { type: "string", default: DEFAULT_TEXT_MODEL },
      system: { type: "string" },
      temperature: { type: "string", default: "0.8" },
      "top-p": { type: "string", default: "0.95" },
      file: { type: "string", multiple: true },
      out: { type: "string" },
      "function-key": { type: "string" },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true, topic: "text" };
  }
  if (!values.prompt?.trim()) {
    throw new Error("--prompt is required");
  }
  const files = normalizeList(values.file);
  if (files.length > 1) {
    throw new Error("--file supports at most 1 item");
  }

  return {
    kind: "text",
    command: "text generate",
    prompt: values.prompt.trim(),
    model: values.model.trim() || DEFAULT_TEXT_MODEL,
    system: values.system?.trim() || "",
    temperature: parseFloatRange(values.temperature, "--temperature", 0, 2),
    topP: parseFloatRange(values["top-p"], "--top-p", 0, 1),
    file: files[0] || "",
    out: values.out || "",
    functionKey: values["function-key"] || "",
    debug: values.debug,
  };
}

function parseModelsListArgs(rest) {
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      "function-key": { type: "string" },
      json: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true, topic: "models" };
  }

  return {
    kind: "models",
    command: "models list",
    functionKey: values["function-key"] || "",
    json: values.json,
    debug: values.debug,
  };
}

export function parseCliArgs(argv) {
  const [first, second, ...rest] = argv;

  if (!first || first === "--help" || first === "-h") {
    return { help: true, topic: "root" };
  }

  if (first === "image") {
    if (!second || second === "--help" || second === "-h") {
      return { help: true, topic: "image" };
    }
    if (second !== "generate") {
      throw new Error(`Unknown image command: ${second}`);
    }
    return parseImageGenerateArgs(rest);
  }

  if (first === "video") {
    if (!second || second === "--help" || second === "-h") {
      return { help: true, topic: "video" };
    }
    if (second !== "generate") {
      throw new Error(`Unknown video command: ${second}`);
    }
    return parseVideoGenerateArgs(rest);
  }

  if (first === "text") {
    if (!second || second === "--help" || second === "-h") {
      return { help: true, topic: "text" };
    }
    if (second !== "generate") {
      throw new Error(`Unknown text command: ${second}`);
    }
    return parseTextGenerateArgs(rest);
  }

  if (first === "models") {
    if (!second || second === "--help" || second === "-h") {
      return { help: true, topic: "models" };
    }
    if (second !== "list") {
      throw new Error(`Unknown models command: ${second}`);
    }
    return parseModelsListArgs(rest);
  }

  throw new Error(`Unknown command: ${first}`);
}
