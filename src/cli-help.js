export function printTopLevelHelp() {
  console.log(`Usage:
  imagine image generate --prompt "..." [options]
  imagine video generate --prompt "..." [options]
  imagine text generate --prompt "..." [options]
  imagine models list [options]

Commands:
  image generate            Generate images
  video generate            Generate video
  text generate             Generate text
  models list               List available models
`);
}

export function printImageHelp() {
  console.log(`Usage:
  imagine image generate --prompt "..." [options]

Options:
  --prompt <text>           Prompt to generate
  --ratio <value>           One of: 2:3, 1:1, 3:2, 16:9, 9:16 (default: 2:3)
  --count <n>               Concurrent task count from 1 to 3 (default: 1)
  --nsfw <true|false>       Whether NSFW is enabled (default: true)
  --out <dir>               Output directory (default: ./output)
  --function-key <key>      Optional function key
  --mode <auto|ws|sse>      Stream mode (default: auto)
  --debug                   Print protocol debug logs
  --help                    Show help
`);
}

export function printVideoHelp() {
  console.log(`Usage:
  imagine video generate --prompt "..." [options]

Options:
  --prompt <text>           Prompt to generate
  --ratio <value>           One of: 3:2, 2:3, 16:9, 9:16, 1:1 (default: 3:2)
  --length <seconds>        Video length from 6 to 30 (default: 6)
  --resolution <value>      One of: 480p, 720p (default: 480p)
  --preset <value>          One of: normal, fun, spicy, custom (default: normal)
  --out <dir>               Output directory (default: ./output)
  --function-key <key>      Optional function key
  --image-url <url>         Reference image URL or data URL, repeatable
  --image-file <path>       Local reference image path, repeatable
  --debug                   Print protocol debug logs
  --help                    Show help
`);
}

export function printTextHelp() {
  console.log(`Usage:
  imagine text generate --prompt "..." [options]

Options:
  --prompt <text>           Prompt to generate
  --model <id>              Model ID (default: grok-4.20-beta)
  --system <text>           Optional system prompt
  --temperature <value>     Number from 0 to 2 (default: 0.8)
  --top-p <value>           Number from 0 to 1 (default: 0.95)
  --file <path>             Optional local attachment file (max: 1)
  --out <path>              Optional output file path
  --function-key <key>      Optional function key
  --debug                   Print protocol debug logs
  --help                    Show help
`);
}

export function printModelsHelp() {
  console.log(`Usage:
  imagine models list [options]

Options:
  --function-key <key>      Optional function key
  --json                    Print raw JSON
  --debug                   Print protocol debug logs
  --help                    Show help
`);
}
