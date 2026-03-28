import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { DecodedImagePayload } from "../shared/types.js";

function stripDataUrlPrefix(value: string): { mime: string | null; payload: string } {
  if (!value.startsWith("data:")) {
    return { mime: null, payload: value };
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) {
    return { mime: null, payload: value };
  }

  const header = value.slice(5, commaIndex);
  const mime = header.split(";")[0] || null;
  return {
    mime,
    payload: value.slice(commaIndex + 1),
  };
}

export function inferImageExtension(raw: string): string {
  if (!raw) {
    return "jpg";
  }

  const { mime, payload } = stripDataUrlPrefix(raw);
  if (mime) {
    if (mime === "image/png") return "png";
    if (mime === "image/gif") return "gif";
    if (mime === "image/webp") return "webp";
    if (mime === "image/jpeg") return "jpg";
  }

  if (payload.startsWith("iVBOR")) return "png";
  if (payload.startsWith("R0lGOD")) return "gif";
  if (payload.startsWith("UklGR")) return "webp";
  if (payload.startsWith("/9j/")) return "jpg";
  return "jpg";
}

export function decodeImagePayload(raw: string): DecodedImagePayload {
  if (!raw) {
    throw new Error("Image payload is empty");
  }

  if (/^https?:\/\//.test(raw)) {
    return { type: "url", data: raw };
  }

  const { payload } = stripDataUrlPrefix(raw);
  return {
    type: "buffer",
    data: Buffer.from(payload.replace(/\s/g, ""), "base64"),
  };
}

export async function ensureOutputDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return path.resolve(dir);
}

export function buildImageOutputFilename({
  timestamp,
  taskId,
  imageId,
  extension,
  partial = false,
}: {
  timestamp: number;
  taskId: string;
  imageId: string;
  extension: string;
  partial?: boolean;
}): string {
  const safeTaskId = String(taskId || "unknown");
  const safeImageId = String(imageId || "image").replace(/[^\w.-]+/g, "_");
  const suffix = partial ? "_partial" : "";
  return `imagine_${timestamp}_${safeTaskId}_${safeImageId}${suffix}.${extension}`;
}

export function buildOutputFilename(args: {
  timestamp: number;
  taskId: string;
  imageId: string;
  extension: string;
  partial?: boolean;
}): string {
  return buildImageOutputFilename(args);
}

export function buildVideoOutputFilename({
  timestamp,
  taskId,
  extension = "mp4",
}: {
  timestamp: number;
  taskId: string;
  extension?: string;
}): string {
  const safeTaskId = String(taskId || "unknown").replace(/[^\w.-]+/g, "_");
  return `video_${timestamp}_${safeTaskId}.${extension}`;
}

export async function saveImagePayload({
  raw,
  outputDir,
  filename,
}: {
  raw: string;
  outputDir: string;
  filename: string;
}): Promise<string> {
  const decoded = decodeImagePayload(raw);
  const fullPath = path.join(outputDir, filename);

  if (decoded.type === "url") {
    await saveBinaryUrlToFile({ url: decoded.data, outputDir, filename });
    return fullPath;
  }

  await writeFile(fullPath, decoded.data);
  return fullPath;
}

export async function saveBinaryUrlToFile({
  url,
  outputDir,
  filename,
}: {
  url: string;
  outputDir: string;
  filename: string;
}): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const fullPath = path.join(outputDir, filename);
  await writeFile(fullPath, Buffer.from(arrayBuffer));
  return fullPath;
}

function inferMimeTypeFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export async function toDataUrlFromFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const mime = inferMimeTypeFromPath(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function saveTextToFile({
  text,
  outputPath,
}: {
  text: string;
  outputPath: string;
}): Promise<string> {
  const fullPath = path.resolve(outputPath);
  const dirPath = path.dirname(fullPath);
  await mkdir(dirPath, { recursive: true });
  await writeFile(fullPath, text, "utf8");
  return fullPath;
}
