import path from "node:path";
import process from "node:process";

import {
  buildImageOutputFilename,
  buildVideoOutputFilename,
  ensureOutputDir,
  inferImageExtension,
  saveBinaryUrlToFile,
  saveImagePayload,
  saveTextToFile,
  toDataUrlFromFile,
} from "./file-utils.js";
import { startTask, stopTasks, streamTask } from "./imagine-client.js";
import { listModels } from "./models-client.js";
import { startTextCompletion } from "./text-client.js";
import { startVideoTask, stopVideoTasks, streamVideoTask } from "./video-client.js";

function withSignalHandlers(onSignal) {
  const handler = async () => {
    await onSignal();
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
}

export async function runImageGenerate(options) {
  const outputDir = await ensureOutputDir(options.out);
  const startedAt = Date.now();
  const timestamp = startedAt;
  const taskIds = [];
  const taskAbortControllers = new Map();
  const savedFinalPaths = new Set();
  const results = { success: 0, failed: 0 };

  let shuttingDown = false;
  const restoreSignals = withSignalHandlers(async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error("Stopping tasks...");
    for (const controller of taskAbortControllers.values()) {
      controller.abort();
    }
    await stopTasks({ taskIds, functionKey: options.functionKey, debug: options.debug });
    process.exitCode = 1;
  });

  try {
    for (let index = 0; index < options.count; index += 1) {
      const taskId = await startTask({
        prompt: options.prompt,
        aspectRatio: options.ratio,
        nsfw: options.nsfw,
        functionKey: options.functionKey,
        debug: options.debug,
      });
      taskIds.push(taskId);
      console.log(`Started task ${taskId}`);
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
            functionKey: options.functionKey,
            signal: controller.signal,
            debug: options.debug,
            startPayload: {
              prompt: options.prompt,
              aspectRatio: options.ratio,
              nsfw: options.nsfw,
            },
            onMessage: async (message) => {
              if (message.type === "error") {
                console.error(`[${taskId}] ${message.message}`);
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
                  console.log(`[${taskId}] saved ${path.relative(process.cwd(), fullPath)}`);
                }
              } else {
                console.log(`[${taskId}] partial ${path.relative(process.cwd(), fullPath)}`);
              }
            },
          });

          if (!taskSavedFinal) {
            results.failed += 1;
          }
        } catch (error) {
          results.failed += 1;
          console.error(`[${taskId}] ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          taskAbortControllers.delete(taskId);
        }
      }),
    );
  } finally {
    restoreSignals();
    await stopTasks({ taskIds, functionKey: options.functionKey, debug: options.debug });
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`Done. success=${results.success} failed=${results.failed} elapsed=${elapsedMs}ms output=${outputDir}`);
}

export async function runVideoGenerate(options) {
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
    functionKey: options.functionKey,
    debug: options.debug,
  });
  console.log(`Started task ${taskId}`);

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
    console.error("Stopping task...");
    controller.abort();
    await stopVideoTasks({ taskIds: [taskId], functionKey: options.functionKey, debug: options.debug });
    process.exitCode = 1;
  });

  try {
    await streamVideoTask({
      taskId,
      functionKey: options.functionKey,
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
          if (event.round !== null && event.roundCount !== null) {
            console.log(`progress [round ${event.round}/${event.roundCount}]=${event.progress}%`);
            return;
          }
          console.log(`progress=${event.progress}%`);
          return;
        }
        if (event.type === "status") {
          console.log(event.message);
          return;
        }
        if (event.type === "resolved" && event.url && event.url !== resolvedUrl) {
          resolvedUrl = event.url;
          console.log(`resolved ${resolvedUrl}`);
        }
      },
    });

    if (!resolvedUrl) {
      failed = 1;
    } else {
      const filename = buildVideoOutputFilename({ timestamp, taskId, extension: "mp4" });
      const fullPath = await saveBinaryUrlToFile({
        url: resolvedUrl,
        outputDir,
        filename,
      });
      success = 1;
      console.log(`saved ${path.relative(process.cwd(), fullPath)}`);
    }
  } catch (error) {
    failed = 1;
    console.error(`[${taskId}] ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    restoreSignals();
    await stopVideoTasks({ taskIds: [taskId], functionKey: options.functionKey, debug: options.debug });
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`Done. success=${success} failed=${failed} elapsed=${elapsedMs}ms output=${outputDir}`);
}

async function buildTextMessages(options) {
  const messages = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }

  if (!options.file) {
    messages.push({ role: "user", content: options.prompt });
    return messages;
  }

  const fileData = await toDataUrlFromFile(options.file);
  const content = [];
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

export async function runTextGenerate(options) {
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
      functionKey: options.functionKey,
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
      console.log(`saved ${path.relative(process.cwd(), savedPath)}`);
    }
  } catch (error) {
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

export async function runModelsList(options) {
  const { payload, items } = await listModels({
    functionKey: options.functionKey,
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
