export type HelpTopic = "root" | "image" | "video" | "text" | "models" | "task" | "auth";

export type ImageRatio = "2:3" | "1:1" | "3:2" | "16:9" | "9:16";
export type ImageMode = "auto" | "ws" | "sse";
export type VideoRatio = "3:2" | "2:3" | "16:9" | "9:16" | "1:1";
export type VideoResolution = "480p" | "720p";
export type VideoPreset = "normal" | "fun" | "spicy" | "custom";

export type HelpCommand = {
  help: true;
  topic: HelpTopic;
};

export type ImageGenerateArgs = {
  kind: "image";
  command: "image generate";
  prompt: string;
  ratio: ImageRatio;
  count: number;
  nsfw: boolean;
  out: string;
  functionKey: string;
  mode: ImageMode;
  partialSave: boolean;
  debug: boolean;
};

export type VideoGenerateArgs = {
  kind: "video";
  command: "video generate";
  prompt: string;
  ratio: VideoRatio;
  length: number;
  resolution: VideoResolution;
  preset: VideoPreset;
  out: string;
  functionKey: string;
  imageUrls: string[];
  imageFiles: string[];
  download: boolean;
  debug: boolean;
};

export type VideoDownloadArgs = {
  kind: "video";
  command: "video download";
  url: string;
  out: string;
  debug: boolean;
};

export type TextGenerateArgs = {
  kind: "text";
  command: "text generate";
  prompt: string;
  model: string;
  system: string;
  temperature: number;
  topP: number;
  file: string;
  out: string;
  functionKey: string;
  debug: boolean;
};

export type ModelsListArgs = {
  kind: "models";
  command: "models list";
  functionKey: string;
  json: boolean;
  debug: boolean;
};

export type TaskKind = "image" | "video";

export type TaskStopArgs = {
  kind: "task";
  command: "task stop";
  taskKind: TaskKind;
  taskId: string;
  functionKey: string;
  debug: boolean;
};

export type AuthSetKeyArgs = {
  kind: "auth";
  command: "auth set-key";
  functionKey: string;
};

export type AuthShowArgs = {
  kind: "auth";
  command: "auth show";
};

export type AuthClearArgs = {
  kind: "auth";
  command: "auth clear";
};

export type ParsedCliArgs =
  | HelpCommand
  | ImageGenerateArgs
  | VideoGenerateArgs
  | VideoDownloadArgs
  | TextGenerateArgs
  | ModelsListArgs
  | TaskStopArgs
  | AuthSetKeyArgs
  | AuthShowArgs
  | AuthClearArgs;

export type RunnableCommand = Exclude<ParsedCliArgs, HelpCommand>;

export type TextContentPart = {
  type: "text";
  text: string;
};

export type FileContentPart = {
  type: "file";
  file: {
    file_data: string;
  };
};

export type UserMessageContent = string | Array<TextContentPart | FileContentPart>;

export type ChatMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: UserMessageContent;
    };

export type NormalizedImageMessage =
  | {
      type: "final" | "partial";
      taskId: string;
      imageId: string | null;
      payload: string | null;
      elapsedMs: number | null;
      raw: unknown;
    }
  | {
      type: "status";
      taskId: string;
      status: string;
      runId: string | null;
      raw: unknown;
    }
  | {
      type: "error";
      taskId: string;
      imageId: string | null;
      message: string;
      raw: unknown;
    };

export type StreamTaskMode = ImageMode;

export type StartTaskPayload = {
  prompt: string;
  aspectRatio: ImageRatio;
  nsfw: boolean;
};

export type VideoProgressInfo = {
  progress: number;
  round: number | null;
  roundCount: number | null;
};

export type VideoResolvedInfo = {
  url?: string;
  html?: string;
};

export type VideoStreamEvent =
  | ({ type: "progress" } & VideoProgressInfo)
  | { type: "status"; message: string }
  | { type: "resolved"; url: string; html: string }
  | { type: "error"; message: string };

export type TextCompletionChunk = {
  choices?: Array<{
    delta?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
};

export type TextCompletionOptions = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  topP: number;
  functionKey?: string;
  debug?: boolean;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void | Promise<void>;
  baseUrl?: string;
};

export type ModelItem = {
  id?: string;
  [key: string]: unknown;
};

export type ModelsPayload = {
  data?: ModelItem[];
  message?: string;
  error?: {
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type DecodedImagePayload =
  | { type: "url"; data: string }
  | { type: "buffer"; data: Buffer };
