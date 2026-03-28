import { parseArgs } from "node:util";
import {
  DEFAULT_TEXT_MODEL,
  IMAGE_MODES,
  IMAGE_RATIOS,
  MAX_VIDEO_REFERENCES,
  VIDEO_PRESETS,
  VIDEO_RATIOS,
  VIDEO_RESOLUTIONS,
} from "./config.js";

import type {
  HelpCommand,
  ImageGenerateArgs,
  ImageMode,
  ImageRatio,
  ModelsListArgs,
  ParsedCliArgs,
  TextGenerateArgs,
  VideoGenerateArgs,
  VideoPreset,
  VideoRatio,
  VideoResolution,
} from "../shared/types.js";

const IMAGE_RATIO_SET = new Set<ImageRatio>(IMAGE_RATIOS);
const IMAGE_MODE_SET = new Set<ImageMode>(IMAGE_MODES);
const VIDEO_RATIO_SET = new Set<VideoRatio>(VIDEO_RATIOS);
const VIDEO_RESOLUTION_SET = new Set<VideoResolution>(VIDEO_RESOLUTIONS);
const VIDEO_PRESET_SET = new Set<VideoPreset>(VIDEO_PRESETS);

function parseBoolean(value: string, flagName: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flagName} must be true or false`);
}

function parseCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    throw new Error("--count must be an integer from 1 to 3");
  }
  return parsed;
}

function parseVideoLength(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 6 || parsed > 30) {
    throw new Error("--length must be an integer from 6 to 30");
  }
  return parsed;
}

function parseFloatRange(value: string, flagName: string, min: number, max: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flagName} must be a number from ${min} to ${max}`);
  }
  return parsed;
}

function normalizeList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseEnumValue<T extends string>(value: string, allowed: ReadonlySet<T>, errorMessage: string): T {
  if (!allowed.has(value as T)) {
    throw new Error(errorMessage);
  }
  return value as T;
}

function makeHelp(topic: HelpCommand["topic"]): HelpCommand {
  return { help: true, topic };
}

function parseImageGenerateArgs(rest: string[]): ImageGenerateArgs | HelpCommand {
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
    return makeHelp("image");
  }
  if (!values.prompt?.trim()) {
    throw new Error("--prompt is required");
  }
  return {
    kind: "image",
    command: "image generate",
    prompt: values.prompt.trim(),
    ratio: parseEnumValue(values.ratio, IMAGE_RATIO_SET, `--ratio must be one of ${IMAGE_RATIOS.join(", ")}`),
    count: parseCount(values.count),
    nsfw: parseBoolean(values.nsfw, "--nsfw"),
    out: values.out,
    functionKey: values["function-key"] || "",
    mode: parseEnumValue(values.mode, IMAGE_MODE_SET, `--mode must be one of ${IMAGE_MODES.join(", ")}`),
    partialSave: false,
    debug: values.debug,
  };
}

function parseVideoGenerateArgs(rest: string[]): VideoGenerateArgs | HelpCommand {
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
    return makeHelp("video");
  }
  if (!values.prompt?.trim()) {
    throw new Error("--prompt is required");
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
    ratio: parseEnumValue(values.ratio, VIDEO_RATIO_SET, `--ratio must be one of ${VIDEO_RATIOS.join(", ")}`),
    length: parseVideoLength(values.length),
    resolution: parseEnumValue(
      values.resolution,
      VIDEO_RESOLUTION_SET,
      `--resolution must be one of ${VIDEO_RESOLUTIONS.join(", ")}`,
    ),
    preset: parseEnumValue(values.preset, VIDEO_PRESET_SET, `--preset must be one of ${VIDEO_PRESETS.join(", ")}`),
    out: values.out,
    functionKey: values["function-key"] || "",
    imageUrls,
    imageFiles,
    debug: values.debug,
  };
}

function parseTextGenerateArgs(rest: string[]): TextGenerateArgs | HelpCommand {
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
    return makeHelp("text");
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

function parseModelsListArgs(rest: string[]): ModelsListArgs | HelpCommand {
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
    return makeHelp("models");
  }

  return {
    kind: "models",
    command: "models list",
    functionKey: values["function-key"] || "",
    json: values.json,
    debug: values.debug,
  };
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [first, second, ...rest] = argv;

  if (!first || first === "--help" || first === "-h") {
    return makeHelp("root");
  }

  if (first === "image") {
    if (!second || second === "--help" || second === "-h") {
      return makeHelp("image");
    }
    if (second !== "generate") {
      throw new Error(`Unknown image command: ${second}`);
    }
    return parseImageGenerateArgs(rest);
  }

  if (first === "video") {
    if (!second || second === "--help" || second === "-h") {
      return makeHelp("video");
    }
    if (second !== "generate") {
      throw new Error(`Unknown video command: ${second}`);
    }
    return parseVideoGenerateArgs(rest);
  }

  if (first === "text") {
    if (!second || second === "--help" || second === "-h") {
      return makeHelp("text");
    }
    if (second !== "generate") {
      throw new Error(`Unknown text command: ${second}`);
    }
    return parseTextGenerateArgs(rest);
  }

  if (first === "models") {
    if (!second || second === "--help" || second === "-h") {
      return makeHelp("models");
    }
    if (second !== "list") {
      throw new Error(`Unknown models command: ${second}`);
    }
    return parseModelsListArgs(rest);
  }

  throw new Error(`Unknown command: ${first}`);
}
