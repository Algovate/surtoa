import { parseCliArgs } from "./args.js";
import { printHelp } from "./help.js";
import {
  runImageGenerate,
  runModelsList,
  runTextGenerate,
  runVideoGenerate,
} from "./runners.js";

import type { RunnableCommand } from "../shared/types.js";

export { parseCliArgs } from "./args.js";

async function runCommand(command: RunnableCommand): Promise<void> {
  switch (command.kind) {
    case "image":
      await runImageGenerate(command);
      return;
    case "video":
      await runVideoGenerate(command);
      return;
    case "text":
      await runTextGenerate(command);
      return;
    case "models":
      await runModelsList(command);
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
