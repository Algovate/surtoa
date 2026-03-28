# Surtoa CLI

CLI for interacting with Surtoa function endpoints from the terminal.

Current commands:

- `imagine image generate`
- `imagine video generate`
- `imagine text generate`
- `imagine models list`

## Requirements

- Node.js `>= 22`

## Install

Install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

Run directly from the repo:

```bash
node dist/bin/imagine.js --help
```

Or link the binary locally:

```bash
npm link
imagine --help
```

## Commands

### Image

Generate images from the `/v1/function/imagine/*` endpoints.

```bash
node dist/bin/imagine.js image generate \
  --prompt "future city at night, neon rain, cinematic" \
  --ratio 2:3 \
  --count 1 \
  --mode auto \
  --out ./output
```

Options:

- `--prompt <text>` required
- `--ratio <2:3|1:1|3:2|16:9|9:16>` default `2:3`
- `--count <1-3>` default `1`
- `--nsfw <true|false>` default `true`
- `--out <dir>` default `./output`
- `--function-key <key>` optional
- `--mode <auto|ws|sse>` default `auto`
- `--debug`

Notes:

- `auto` tries WebSocket first and falls back to SSE when needed.
- Generated images are saved into the output directory.

### Video

Generate videos from the `/v1/function/video/*` endpoints.

```bash
node dist/bin/imagine.js video generate \
  --prompt "a red apple slowly rotating on a wooden table" \
  --ratio 3:2 \
  --length 6 \
  --resolution 480p \
  --preset normal \
  --out ./output
```

Reference images can be passed either as URLs or local files.

URL example:

```bash
node dist/bin/imagine.js video generate \
  --prompt "@图1 street at night, slow camera push" \
  --image-url "https://example.com/ref.jpg"
```

Local file example:

```bash
node dist/bin/imagine.js video generate \
  --prompt "@图1 street at night, slow camera push" \
  --image-file ./ref1.jpg \
  --image-file ./ref2.png
```

Options:

- `--prompt <text>` required
- `--ratio <3:2|2:3|16:9|9:16|1:1>` default `3:2`
- `--length <6-30>` default `6`
- `--resolution <480p|720p>` default `480p`
- `--preset <normal|fun|spicy|custom>` default `normal`
- `--out <dir>` default `./output`
- `--function-key <key>` optional
- `--image-url <url>` repeatable, max `7`
- `--image-file <path>` repeatable, max `7`
- `--debug`

Notes:

- `--image-url` and `--image-file` cannot be used together.
- The CLI parses progress from the SSE stream and downloads the final `mp4`.

### Text

Generate text from the `/v1/function/chat/completions` endpoint.

```bash
node dist/bin/imagine.js text generate \
  --prompt "用一句话介绍你自己"
```

With system prompt:

```bash
node dist/bin/imagine.js text generate \
  --prompt "写一个三行简介" \
  --system "你是一个简洁的中文写作助手"
```

With output file:

```bash
node dist/bin/imagine.js text generate \
  --prompt "写一个三行简介" \
  --out ./output/result.txt
```

With local file attachment:

```bash
node dist/bin/imagine.js text generate \
  --prompt "总结这个文件内容" \
  --file ./notes.png
```

Options:

- `--prompt <text>` required
- `--model <id>` default `grok-4.20-beta`
- `--system <text>` optional
- `--temperature <0-2>` default `0.8`
- `--top-p <0-1>` default `0.95`
- `--file <path>` optional, max `1`
- `--out <path>` optional
- `--function-key <key>` optional
- `--debug`

Notes:

- Output is streamed to stdout as tokens arrive.
- If `--out` is provided, the final text is also written to a UTF-8 file.

### Models

List models from `/v1/models`.

```bash
node dist/bin/imagine.js models list --function-key YOUR_KEY
```

JSON output:

```bash
node dist/bin/imagine.js models list --function-key YOUR_KEY --json
```

Options:

- `--function-key <key>` optional in the CLI interface, but some deployments require it
- `--json`
- `--debug`

## Output

Generated files are typically written under `./output` by default:

- images: `imagine_<timestamp>_<taskId>_<imageId>.<ext>`
- videos: `video_<timestamp>_<taskId>.mp4`
- text: custom path when `--out` is provided

## Development

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Show command help:

```bash
node dist/bin/imagine.js
node dist/bin/imagine.js image generate --help
node dist/bin/imagine.js video generate --help
node dist/bin/imagine.js text generate --help
node dist/bin/imagine.js models list --help
```

## Source Layout

```text
src/
  cli/       command parsing, help, and command runners
  clients/   API clients for imagine, video, text, and models
  shared/    shared TypeScript types
  utils/     filesystem helpers
bin/         CLI entrypoint
test/        node:test suites
```
