import { HELP_SECTIONS } from "./config.js";

import type { HelpTopic } from "../shared/types.js";

function formatBlock(topic: HelpTopic): string {
  const section = HELP_SECTIONS[topic];
  const lines = ["Usage:"];

  for (const usage of section.usage) {
    lines.push(`  ${usage}`);
  }

  if (section.commands?.length) {
    lines.push("", "Commands:");
    for (const command of section.commands) {
      lines.push(`  ${command.name.padEnd(24, " ")}${command.description}`);
    }
  }

  if (section.options?.length) {
    lines.push("", "Options:");
    for (const option of section.options) {
      lines.push(`  ${option.flag.padEnd(24, " ")}${option.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function printHelp(topic: HelpTopic): void {
  console.log(formatBlock(topic));
}
