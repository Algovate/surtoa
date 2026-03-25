import { parseCliArgs } from "./cli-args.js";
import {
  printImageHelp,
  printModelsHelp,
  printTextHelp,
  printTopLevelHelp,
  printVideoHelp,
} from "./cli-help.js";
import {
  runImageGenerate,
  runModelsList,
  runTextGenerate,
  runVideoGenerate,
} from "./cli-runners.js";

function printHelp(topic) {
  if (topic === "image") {
    printImageHelp();
    return;
  }
  if (topic === "video") {
    printVideoHelp();
    return;
  }
  if (topic === "text") {
    printTextHelp();
    return;
  }
  if (topic === "models") {
    printModelsHelp();
    return;
  }
  printTopLevelHelp();
}

export { parseCliArgs } from "./cli-args.js";

export async function runCli(argv) {
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    printHelp(parsed.topic);
    return;
  }

  if (parsed.kind === "image") {
    await runImageGenerate(parsed);
    return;
  }
  if (parsed.kind === "video") {
    await runVideoGenerate(parsed);
    return;
  }
  if (parsed.kind === "text") {
    await runTextGenerate(parsed);
    return;
  }
  if (parsed.kind === "models") {
    await runModelsList(parsed);
  }
}
