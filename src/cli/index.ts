import { parseCliArgs } from "./args.js";
import { printHelp } from "./help.js";
import {
  runAuthClear,
  runAuthSetKey,
  runAuthShow,
  runImageGenerate,
  runModelsList,
  runTaskStop,
  runTextGenerate,
  runVideoDownload,
  runVideoGenerate,
} from "./runners.js";

import type { RunnableCommand } from "../shared/types.js";

export { parseCliArgs } from "./args.js";

async function runCommand(command: RunnableCommand): Promise<void> {
  switch (command.command) {
    case "image generate":
      await runImageGenerate(command);
      return;
    case "video generate":
      await runVideoGenerate(command);
      return;
    case "video download":
      await runVideoDownload(command);
      return;
    case "text generate":
      await runTextGenerate(command);
      return;
    case "models list":
      await runModelsList(command);
      return;
    case "task stop":
      await runTaskStop(command);
      return;
    case "auth set-key":
      await runAuthSetKey(command);
      return;
    case "auth show":
      await runAuthShow();
      return;
    case "auth clear":
      await runAuthClear();
      return;
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseCliArgs(argv);
  if ("help" in parsed) {
    printHelp(parsed.topic);
    return;
  }
  await runCommand(parsed);
}
