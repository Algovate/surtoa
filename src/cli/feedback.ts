import * as path from "node:path";

type TaskFeedback = {
  taskId: string;
};

function relativeToCwd(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

export function printTaskStarted({ taskId }: TaskFeedback): void {
  console.log(`Started task ${taskId}`);
}

export function printTaskStopping(label: string): void {
  console.error(`Stopping ${label}...`);
}

export function printTaskError({ taskId }: TaskFeedback, error: unknown): void {
  console.error(`[${taskId}] ${error instanceof Error ? error.message : String(error)}`);
}

export function printImageSaved({ taskId }: TaskFeedback, filePath: string): void {
  console.log(`[${taskId}] saved ${relativeToCwd(filePath)}`);
}

export function printImagePartial({ taskId }: TaskFeedback, filePath: string): void {
  console.log(`[${taskId}] partial ${relativeToCwd(filePath)}`);
}

export function printVideoProgress(progress: number, round: number | null, roundCount: number | null): void {
  if (round !== null && roundCount !== null) {
    console.log(`progress [round ${round}/${roundCount}]=${progress}%`);
    return;
  }
  console.log(`progress=${progress}%`);
}

export function printResolvedUrl(url: string): void {
  console.log(`resolved ${url}`);
}

export function printSavedFile(filePath: string): void {
  console.log(`saved ${relativeToCwd(filePath)}`);
}

export function printSummary({
  success,
  failed,
  elapsedMs,
  outputDir,
}: {
  success: number;
  failed: number;
  elapsedMs: number;
  outputDir: string;
}): void {
  console.log(`Done. success=${success} failed=${failed} elapsed=${elapsedMs}ms output=${outputDir}`);
}
