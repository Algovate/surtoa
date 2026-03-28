import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const CONFIG_DIR = path.join(os.homedir(), ".config", "surtoa");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

type StoredConfig = {
  functionKey?: string;
};

function normalizeConfig(value: unknown): StoredConfig {
  if (!value || typeof value !== "object") {
    return {};
  }
  const config = value as Record<string, unknown>;
  return {
    functionKey: typeof config.functionKey === "string" ? config.functionKey : undefined,
  };
}

export async function readConfig(): Promise<StoredConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw) as unknown);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function writeConfig(config: StoredConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function getConfiguredFunctionKey(): Promise<string> {
  const config = await readConfig();
  return config.functionKey || "";
}

export async function setConfiguredFunctionKey(functionKey: string): Promise<void> {
  await writeConfig({ functionKey });
}

export async function clearConfiguredFunctionKey(): Promise<void> {
  try {
    await rm(CONFIG_PATH);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export function maskFunctionKey(functionKey: string): string {
  if (!functionKey) {
    return "";
  }
  if (functionKey.length <= 8) {
    return `${functionKey.slice(0, 2)}***${functionKey.slice(-2)}`;
  }
  return `${functionKey.slice(0, 4)}***${functionKey.slice(-4)}`;
}
