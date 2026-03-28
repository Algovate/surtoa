import type {
  HelpTopic,
  ImageMode,
  ImageRatio,
  TextGenerateArgs,
  VideoPreset,
  VideoRatio,
  VideoResolution,
} from "../shared/types.js";

export const DEFAULT_TEXT_MODEL: TextGenerateArgs["model"] = "grok-4.20-beta";
export const MAX_VIDEO_REFERENCES = 7;

export const IMAGE_RATIOS = ["2:3", "1:1", "3:2", "16:9", "9:16"] as const satisfies readonly ImageRatio[];
export const IMAGE_MODES = ["auto", "ws", "sse"] as const satisfies readonly ImageMode[];
export const VIDEO_RATIOS = ["3:2", "2:3", "16:9", "9:16", "1:1"] as const satisfies readonly VideoRatio[];
export const VIDEO_RESOLUTIONS = ["480p", "720p"] as const satisfies readonly VideoResolution[];
export const VIDEO_PRESETS = ["normal", "fun", "spicy", "custom"] as const satisfies readonly VideoPreset[];

type HelpSection = {
  usage: string[];
  commands?: Array<{ name: string; description: string }>;
  options?: Array<{ flag: string; description: string }>;
};

export const HELP_SECTIONS: Record<HelpTopic, HelpSection> = {
  root: {
    usage: [
      "surtoa image generate --prompt \"...\" [options]",
      "surtoa video generate --prompt \"...\" [options]",
      "surtoa text generate --prompt \"...\" [options]",
      "surtoa models list [options]",
    ],
    commands: [
      { name: "image generate", description: "Generate images" },
      { name: "video generate", description: "Generate video" },
      { name: "text generate", description: "Generate text" },
      { name: "models list", description: "List available models" },
    ],
  },
  image: {
    usage: ["surtoa image generate --prompt \"...\" [options]"],
    options: [
      { flag: "--prompt <text>", description: "Prompt to generate" },
      { flag: "--ratio <value>", description: `One of: ${IMAGE_RATIOS.join(", ")} (default: 2:3)` },
      { flag: "--count <n>", description: "Concurrent task count from 1 to 3 (default: 1)" },
      { flag: "--nsfw <true|false>", description: "Whether NSFW is enabled (default: true)" },
      { flag: "--out <dir>", description: "Output directory (default: ./output)" },
      { flag: "--function-key <key>", description: "Optional function key" },
      { flag: `--mode <${IMAGE_MODES.join("|")}>`, description: "Stream mode (default: auto)" },
      { flag: "--debug", description: "Print protocol debug logs" },
      { flag: "--help", description: "Show help" },
    ],
  },
  video: {
    usage: ["surtoa video generate --prompt \"...\" [options]"],
    options: [
      { flag: "--prompt <text>", description: "Prompt to generate" },
      { flag: "--ratio <value>", description: `One of: ${VIDEO_RATIOS.join(", ")} (default: 3:2)` },
      { flag: "--length <seconds>", description: "Video length from 6 to 30 (default: 6)" },
      { flag: "--resolution <value>", description: `One of: ${VIDEO_RESOLUTIONS.join(", ")} (default: 480p)` },
      { flag: "--preset <value>", description: `One of: ${VIDEO_PRESETS.join(", ")} (default: normal)` },
      { flag: "--out <dir>", description: "Output directory (default: ./output)" },
      { flag: "--function-key <key>", description: "Optional function key" },
      { flag: "--image-url <url>", description: `Reference image URL or data URL, repeatable, max ${MAX_VIDEO_REFERENCES}` },
      { flag: "--image-file <path>", description: `Local reference image path, repeatable, max ${MAX_VIDEO_REFERENCES}` },
      { flag: "--debug", description: "Print protocol debug logs" },
      { flag: "--help", description: "Show help" },
    ],
  },
  text: {
    usage: ["surtoa text generate --prompt \"...\" [options]"],
    options: [
      { flag: "--prompt <text>", description: "Prompt to generate" },
      { flag: "--model <id>", description: `Model ID (default: ${DEFAULT_TEXT_MODEL})` },
      { flag: "--system <text>", description: "Optional system prompt" },
      { flag: "--temperature <value>", description: "Number from 0 to 2 (default: 0.8)" },
      { flag: "--top-p <value>", description: "Number from 0 to 1 (default: 0.95)" },
      { flag: "--file <path>", description: "Optional local attachment file (max: 1)" },
      { flag: "--out <path>", description: "Optional output file path" },
      { flag: "--function-key <key>", description: "Optional function key" },
      { flag: "--debug", description: "Print protocol debug logs" },
      { flag: "--help", description: "Show help" },
    ],
  },
  models: {
    usage: ["surtoa models list [options]"],
    options: [
      { flag: "--function-key <key>", description: "Optional function key" },
      { flag: "--json", description: "Print raw JSON" },
      { flag: "--debug", description: "Print protocol debug logs" },
      { flag: "--help", description: "Show help" },
    ],
  },
};
