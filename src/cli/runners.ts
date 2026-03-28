import * as path from "node:path";

import {
  buildImageOutputFilename,
  buildVideoOutputFilename,
  ensureOutputDir,
  inferImageExtension,
  saveBinaryUrlToFile,
  saveImagePayload,
  saveTextToFile,
  toDataUrlFromFile,
} from "../utils/file.js";
import { startTask, stopTasks, streamTask } from "../clients/imagine.js";
import { listModels } from "../clients/models.js";
import { startTextCompletion } from "../clients/text.js";
import { startVideoTask, stopVideoTasks, streamVideoTask } from "../clients/video.js";
import {
  clearConfiguredFunctionKey,
  getConfiguredFunctionKey,
  maskFunctionKey,
  setConfiguredFunctionKey,
} from "./auth.js";
import {
  printDownloadSkipped,
  printImagePartial,
  printImageSaved,
  printResolvedUrl,
  printSavedFile,
  printSummary,
  printTaskError,
  printTaskStarted,
  printTaskStopping,
  printVideoProgress,
} from "./feedback.js";

import type {
  AuthSetKeyArgs,
  ChatMessage,
  FileContentPart,
  ImageGenerateArgs,
  ModelsListArgs,
  TaskStopArgs,
  TextContentPart,
  TextGenerateArgs,
  VideoDownloadArgs,
  VideoGenerateArgs,
} from "../shared/types.js";

function withSignalHandlers(onSignal: () => Promise<void>): () => void {
  const handler = async (): Promise<void> => {
    await onSignal();
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
}

type RunCounts = {
  success: number;
  failed: number;
};

function createCounts(): RunCounts {
  return { success: 0, failed: 0 };
}

async function resolveFunctionKey(value: string): Promise<string> {
  return value || (await getConfiguredFunctionKey());
}

export async function runImageGenerate(options: ImageGenerateArgs): Promise<void> {
  const functionKey = await resolveFunctionKey(options.functionKey);
  const outputDir = await ensureOutputDir(options.out);
  const startedAt = Date.now();
  const timestamp = startedAt;
  const taskIds: string[] = [];
  const taskAbortControllers = new Map<string, AbortController>();
  const savedFinalPaths = new Set<string>();
  const results = createCounts();

  let shuttingDown = false;
  const restoreSignals = withSignalHandlers(async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    printTaskStopping("tasks");
    for (const controller of taskAbortControllers.values()) {
      controller.abort();
    }
    await stopTasks({ taskIds, functionKey, debug: options.debug });
    process.exitCode = 1;
  });

  try {
    for (let index = 0; index < options.count; index += 1) {
      const taskId = await startTask({
        prompt: options.prompt,
        aspectRatio: options.ratio,
        nsfw: options.nsfw,
        functionKey,
        debug: options.debug,
      });
      taskIds.push(taskId);
      printTaskStarted({ taskId });
    }

    await Promise.all(
      taskIds.map(async (taskId) => {
        const controller = new AbortController();
        let taskSavedFinal = false;
        taskAbortControllers.set(taskId, controller);

        try {
          await streamTask({
            taskId,
            mode: options.mode,
            functionKey,
            signal: controller.signal,
            debug: options.debug,
            startPayload: {
              prompt: options.prompt,
              aspectRatio: options.ratio,
              nsfw: options.nsfw,
            },
            onMessage: async (message) => {
              if (message.type === "error") {
                printTaskError({ taskId }, new Error(message.message));
                return;
              }
              if (message.type !== "final" && !(message.type === "partial" && options.partialSave)) {
                return;
              }
              if (!message.payload) {
                return;
              }

              const extension = inferImageExtension(message.payload);
              const filename = buildImageOutputFilename({
                timestamp,
                taskId,
                imageId: message.imageId || "image",
                extension,
                partial: message.type === "partial",
              });
              const fullPath = await saveImagePayload({
                raw: message.payload,
                outputDir,
                filename,
              });

              if (message.type === "final") {
                if (!savedFinalPaths.has(fullPath)) {
                  savedFinalPaths.add(fullPath);
                  taskSavedFinal = true;
                  results.success += 1;
                  printImageSaved({ taskId }, fullPath);
                }
              } else {
                printImagePartial({ taskId }, fullPath);
              }
            },
          });

          if (!taskSavedFinal) {
            results.failed += 1;
          }
        } catch (error: unknown) {
          results.failed += 1;
          printTaskError({ taskId }, error);
        } finally {
          taskAbortControllers.delete(taskId);
        }
      }),
    );
  } finally {
    restoreSignals();
    await stopTasks({ taskIds, functionKey, debug: options.debug });
  }

  const elapsedMs = Date.now() - startedAt;
  printSummary({ success: results.success, failed: results.failed, elapsedMs, outputDir });
}

export async function runVideoGenerate(options: VideoGenerateArgs): Promise<void> {
  const functionKey = await resolveFunctionKey(options.functionKey);
  const outputDir = await ensureOutputDir(options.out);
  const startedAt = Date.now();
  const imageUrls = options.imageFiles.length
    ? await Promise.all(options.imageFiles.map((filePath) => toDataUrlFromFile(filePath)))
    : options.imageUrls;

  const taskId = await startVideoTask({
    prompt: options.prompt,
    imageUrls,
    aspectRatio: options.ratio,
    videoLength: options.length,
    resolutionName: options.resolution,
    preset: options.preset,
    functionKey,
    debug: options.debug,
  });
  printTaskStarted({ taskId });

  const controller = new AbortController();
  let lastProgressKey = "";
  let resolvedUrl = "";
  let success = 0;
  let failed = 0;
  const timestamp = startedAt;

  let shuttingDown = false;
  const restoreSignals = withSignalHandlers(async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    printTaskStopping("task");
    controller.abort();
    await stopVideoTasks({ taskIds: [taskId], functionKey, debug: options.debug });
    process.exitCode = 1;
  });

  try {
    await streamVideoTask({
      taskId,
      functionKey,
      signal: controller.signal,
      debug: options.debug,
      onEvent: async (event) => {
        if (event.type === "error") {
          throw new Error(event.message);
        }
        if (event.type === "progress") {
          const progressKey = `${event.round ?? "none"}/${event.roundCount ?? "none"}:${event.progress}`;
          if (progressKey === lastProgressKey) {
            return;
          }
          lastProgressKey = progressKey;
          printVideoProgress(event.progress, event.round, event.roundCount);
          return;
        }
        if (event.type === "status") {
          console.log(event.message);
          return;
        }
        if (event.type === "resolved" && event.url !== resolvedUrl) {
          resolvedUrl = event.url;
          printResolvedUrl(resolvedUrl);
        }
      },
    });

    if (!resolvedUrl) {
      failed = 1;
    } else if (!options.download) {
      success = 1;
      printDownloadSkipped();
    } else {
      const filename = buildVideoOutputFilename({ timestamp, taskId, extension: "mp4" });
      const fullPath = await saveBinaryUrlToFile({
        url: resolvedUrl,
        outputDir,
        filename,
      });
      success = 1;
      printSavedFile(fullPath);
    }
  } catch (error: unknown) {
    failed = 1;
    printTaskError({ taskId }, error);
  } finally {
    restoreSignals();
    await stopVideoTasks({ taskIds: [taskId], functionKey, debug: options.debug });
  }

  const elapsedMs = Date.now() - startedAt;
  printSummary({ success, failed, elapsedMs, outputDir });
}

function inferFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = path.basename(pathname);
    if (basename && basename !== "/" && path.extname(basename)) {
      return basename;
    }
  } catch {
    // ignore
  }
  return `video_${Date.now()}.mp4`;
}

function resolveDownloadTarget(url: string, out: string): { outputDir: string; filename: string } {
  const ext = path.extname(out).toLowerCase();
  if (ext) {
    return {
      outputDir: path.dirname(out),
      filename: path.basename(out),
    };
  }
  return {
    outputDir: out,
    filename: inferFilenameFromUrl(url),
  };
}

export async function runVideoDownload(options: VideoDownloadArgs): Promise<void> {
  const startedAt = Date.now();
  const { outputDir, filename } = resolveDownloadTarget(options.url, options.out);
  const ensuredOutputDir = await ensureOutputDir(outputDir);
  const fullPath = await saveBinaryUrlToFile({
    url: options.url,
    outputDir: ensuredOutputDir,
    filename,
  });
  printSavedFile(fullPath);
  printSummary({
    success: 1,
    failed: 0,
    elapsedMs: Date.now() - startedAt,
    outputDir: ensuredOutputDir,
  });
}

async function buildTextMessages(options: TextGenerateArgs): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }

  if (!options.file) {
    messages.push({ role: "user", content: options.prompt });
    return messages;
  }

  const fileData = await toDataUrlFromFile(options.file);
  const content: Array<TextContentPart | FileContentPart> = [];
  if (options.prompt) {
    content.push({ type: "text", text: options.prompt });
  }
  content.push({
    type: "file",
    file: {
      file_data: fileData,
    },
  });
  messages.push({ role: "user", content });
  return messages;
}

export async function runTextGenerate(options: TextGenerateArgs): Promise<void> {
  const functionKey = await resolveFunctionKey(options.functionKey);
  const messages = await buildTextMessages(options);
  const controller = new AbortController();
  let output = "";
  let aborted = false;

  const restoreSignals = withSignalHandlers(async () => {
    aborted = true;
    controller.abort();
  });

  try {
    output = await startTextCompletion({
      model: options.model,
      messages,
      temperature: options.temperature,
      topP: options.topP,
      functionKey,
      debug: options.debug,
      signal: controller.signal,
      onDelta: (delta) => {
        process.stdout.write(delta);
      },
    });

    if (!output.endsWith("\n")) {
      process.stdout.write("\n");
    }

    if (options.out) {
      const savedPath = await saveTextToFile({ text: output, outputPath: options.out });
      printSavedFile(savedPath);
    }
  } catch (error: unknown) {
    if (aborted) {
      if (output && !output.endsWith("\n")) {
        process.stdout.write("\n");
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    restoreSignals();
  }
}

export async function runModelsList(options: ModelsListArgs): Promise<void> {
  const functionKey = await resolveFunctionKey(options.functionKey);
  const { payload, items } = await listModels({
    functionKey,
    debug: options.debug,
  });

  if (options.json) {
    console.log(JSON.stringify(payload ?? { data: items }, null, 2));
    return;
  }

  for (const item of items) {
    if (item?.id) {
      console.log(item.id);
    }
  }
}

export async function runTaskStop(options: TaskStopArgs): Promise<void> {
  const functionKey = await resolveFunctionKey(options.functionKey);
  if (options.taskKind === "image") {
    await stopTasks({
      taskIds: [options.taskId],
      functionKey,
      debug: options.debug,
    });
  } else {
    await stopVideoTasks({
      taskIds: [options.taskId],
      functionKey,
      debug: options.debug,
    });
  }

  console.log(`stop requested kind=${options.taskKind} taskId=${options.taskId}`);
}

export async function runAuthSetKey(options: AuthSetKeyArgs): Promise<void> {
  await setConfiguredFunctionKey(options.functionKey);
  console.log(`saved function key ${maskFunctionKey(options.functionKey)}`);
}

export async function runAuthShow(): Promise<void> {
  const functionKey = await getConfiguredFunctionKey();
  if (!functionKey) {
    console.log("function key not configured");
    return;
  }
  console.log(`configured function key ${maskFunctionKey(functionKey)}`);
}

export async function runAuthClear(): Promise<void> {
  await clearConfiguredFunctionKey();
  console.log("cleared function key");
}
