import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseCliArgs } from "../src/cli.js";
import {
  buildImageOutputFilename,
  buildOutputFilename,
  buildVideoOutputFilename,
  inferImageExtension,
  saveTextToFile,
  toDataUrlFromFile,
} from "../src/file-utils.js";
import { extractVideoInfo, parseDeltaProgress } from "../src/video-client.js";
import { listModels } from "../src/models-client.js";
import { startTextCompletion } from "../src/text-client.js";

test("parseCliArgs requires prompt", () => {
  assert.throws(() => parseCliArgs(["image", "generate"]), /--prompt is required/);
});

test("parseCliArgs validates ratio", () => {
  assert.throws(
    () => parseCliArgs(["image", "generate", "--prompt", "cat", "--ratio", "4:5"]),
    /--ratio must be one of/,
  );
});

test("parseCliArgs validates count", () => {
  assert.throws(
    () => parseCliArgs(["image", "generate", "--prompt", "cat", "--count", "4"]),
    /--count must be an integer from 1 to 3/,
  );
});

test("parseCliArgs rejects removed generate alias", () => {
  assert.throws(() => parseCliArgs(["generate", "--prompt", "cat"]), /Unknown command: generate/);
});

test("parseCliArgs supports image subcommand", () => {
  const parsed = parseCliArgs(["image", "generate", "--prompt", "cat"]);
  assert.equal(parsed.kind, "image");
  assert.equal(parsed.command, "image generate");
});

test("parseCliArgs supports video subcommand", () => {
  const parsed = parseCliArgs(["video", "generate", "--prompt", "clip"]);
  assert.equal(parsed.kind, "video");
  assert.equal(parsed.ratio, "3:2");
  assert.equal(parsed.length, 6);
});

test("parseCliArgs validates video reference exclusivity", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "video",
        "generate",
        "--prompt",
        "clip",
        "--image-url",
        "https://example.com/a.png",
        "--image-file",
        "a.png",
      ]),
    /cannot be used together/,
  );
});

test("parseCliArgs validates video preset", () => {
  assert.throws(
    () => parseCliArgs(["video", "generate", "--prompt", "clip", "--preset", "bad"]),
    /--preset must be one of/,
  );
});

test("parseCliArgs supports text subcommand", () => {
  const parsed = parseCliArgs(["text", "generate", "--prompt", "hello"]);
  assert.equal(parsed.kind, "text");
  assert.equal(parsed.model, "grok-4.20-beta");
  assert.equal(parsed.temperature, 0.8);
  assert.equal(parsed.topP, 0.95);
});

test("parseCliArgs validates text temperature", () => {
  assert.throws(
    () => parseCliArgs(["text", "generate", "--prompt", "hello", "--temperature", "2.5"]),
    /--temperature must be a number from 0 to 2/,
  );
});

test("parseCliArgs validates text top-p", () => {
  assert.throws(
    () => parseCliArgs(["text", "generate", "--prompt", "hello", "--top-p", "1.5"]),
    /--top-p must be a number from 0 to 1/,
  );
});

test("parseCliArgs validates max one text file", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "text",
        "generate",
        "--prompt",
        "hello",
        "--file",
        "a.txt",
        "--file",
        "b.txt",
      ]),
    /--file supports at most 1 item/,
  );
});

test("parseCliArgs supports models list subcommand", () => {
  const parsed = parseCliArgs(["models", "list"]);
  assert.equal(parsed.kind, "models");
  assert.equal(parsed.command, "models list");
  assert.equal(parsed.json, false);
});

test("inferImageExtension detects common image types", () => {
  assert.equal(inferImageExtension("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"), "png");
  assert.equal(inferImageExtension("/9j/4AAQSkZJRgABAQAAAQABAAD"), "jpg");
  assert.equal(inferImageExtension("R0lGODlhAQABAAAAACH5BAEKAAEA"), "gif");
});

test("buildOutputFilename includes task and image ids", () => {
  const filename = buildOutputFilename({
    timestamp: 123,
    taskId: "task-1",
    imageId: "image/2",
    extension: "jpg",
  });

  assert.equal(filename, "imagine_123_task-1_image_2.jpg");
});

test("buildImageOutputFilename matches legacy image naming", () => {
  const filename = buildImageOutputFilename({
    timestamp: 123,
    taskId: "task-1",
    imageId: "image/2",
    extension: "jpg",
  });
  assert.equal(filename, "imagine_123_task-1_image_2.jpg");
});

test("buildVideoOutputFilename uses video prefix", () => {
  const filename = buildVideoOutputFilename({
    timestamp: 123,
    taskId: "task/1",
    extension: "mp4",
  });
  assert.equal(filename, "video_123_task_1.mp4");
});

test("extractVideoInfo supports html, markdown, and plain url", () => {
  assert.deepEqual(extractVideoInfo('<video controls><source src="https://a.com/x.mp4" type="video/mp4"></video>'), {
    url: "https://a.com/x.mp4",
    html: '<video controls><source src="https://a.com/x.mp4" type="video/mp4"></video>',
  });
  assert.deepEqual(extractVideoInfo("hello [video](https://a.com/y.mp4)"), {
    url: "https://a.com/y.mp4",
  });
  assert.deepEqual(extractVideoInfo("see https://a.com/z.mp4 now"), {
    url: "https://a.com/z.mp4",
  });
});

test("parseDeltaProgress keeps round metadata when present", () => {
  assert.deepEqual(parseDeltaProgress("[round=2/3] progress=34%"), {
    progress: 34,
    round: 2,
    roundCount: 3,
  });
});

test("parseDeltaProgress parses generic progress without rounds", () => {
  assert.deepEqual(parseDeltaProgress("progress=95%"), {
    progress: 95,
    round: null,
    roundCount: null,
  });
});

test("toDataUrlFromFile converts local file to data url", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "surtoa-cli-"));
  const filePath = path.join(tempDir, "tiny.png");
  await writeFile(filePath, Buffer.from("pngdata"));
  const dataUrl = await toDataUrlFromFile(filePath);
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("saveTextToFile writes utf8 text", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "surtoa-cli-text-"));
  const filePath = path.join(tempDir, "result.txt");
  const savedPath = await saveTextToFile({ text: "hello", outputPath: filePath });
  assert.equal(savedPath, filePath);
});

test("startTextCompletion streams and concatenates deltas", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      { status: 200 },
    );

  const seen = [];
  try {
    const result = await startTextCompletion({
      model: "grok-4.20-beta",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.8,
      topP: 0.95,
      onDelta: (delta) => {
        seen.push(delta);
      },
    });
    assert.equal(result, "Hello");
    assert.deepEqual(seen, ["Hel", "lo"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listModels returns model items", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ id: "grok-4.20-beta" }, { id: "grok-4" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const result = await listModels({});
    assert.deepEqual(result.items, [{ id: "grok-4.20-beta" }, { id: "grok-4" }]);
    assert.deepEqual(result.payload, { data: [{ id: "grok-4.20-beta" }, { id: "grok-4" }] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
