---
description: "GuideFlow CLI reference — the real flags for guideflow init, studio, export and push in @guideflow/cli, including their current limitations."
keywords: GuideFlow CLI, guideflow init, guideflow studio, guideflow export, guideflow push, @guideflow/cli
---

# CLI Reference

`@guideflow/cli` provides the `guideflow` command for scaffolding starter files, serving your
project with a dev server, converting flow files to JSON, and POSTing a flow JSON file to an HTTP
endpoint.

::: warning Status
The CLI is the least finished part of GuideFlow. There is **no visual tour editor** — `studio` is a
Vite dev server (see below) — `export` produces a usable file only for `.json` input, and `push`
needs an endpoint you host yourself. Read each command's limitations before you build a workflow
around it.
:::

Requires Node.js >= 18.

## Installation

```bash
# Install globally
npm install -g @guideflow/cli

# Or run without installing
npx @guideflow/cli <command>
```

## Commands

### `guideflow init`

Writes starter files into a directory.

```bash
guideflow init [options]
```

| Option | Default | Description |
|---|---|---|
| `--dir <directory>` | `.` | Target directory (pre-fills the interactive prompt) |
| `--framework <framework>` | — | `react`, `vue`, `svelte` or `none`; skips the framework prompt |

`init` is **always interactive**: it asks where to place the files even when `--dir` is passed
(`--dir` only supplies the default answer), so it cannot be used unattended or in CI.

Files written into the chosen directory:

- `guideflow.ts` — creates and exports a `createGuideFlow({})` instance
- `my-tour.ts` — an example `FlowDefinition` with two states, the second `final: true`
- `GuideFlowProvider.tsx` — **React only**; a `TourProvider` wrapper. Choosing `vue` or `svelte`
  writes no adapter file, only the two files above.

Existing files of those names are overwritten without a prompt. No `package.json` is modified and
no dependencies are installed — `init` prints the `pnpm add` line for you to run yourself.

```bash
# Scaffold into the current directory
guideflow init

# Pre-fill the directory prompt and skip the framework question
guideflow init --dir ./src --framework react
```

There is no `guideflow.config.ts`. No GuideFlow command reads a project config file; every command
takes its input on the command line.

---

### `guideflow studio`

Starts a [Vite](https://vitejs.dev) dev server over your project directory and injects
`window.__GUIDEFLOW_DEVTOOLS__ = true` into every HTML response.

```bash
guideflow studio [options]
```

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `4747` | Port to listen on |
| `--root <dir>` | `.` | Project root directory to serve |
| `--host <host>` | `127.0.0.1` | Interface to bind to |

::: warning The editor does not exist yet
`studio` does not open a tour editor, and it does not open a browser. It serves your project and
sets one global flag. **No `@guideflow/*` package reads `window.__GUIDEFLOW_DEVTOOLS__`** — only the
repo's own demo app looks at it, to show a badge. The DevTools extension detects pages through a
different global, `window.__guideflow`, which the library does not set either. Until the editor is
built, `guideflow studio` is `vite dev` plus an inert script tag.
:::

Vite is an **optional peer dependency** — it is not installed with the CLI. Projects that already
have Vite need no extra step; anyone else gets an error telling them to run `pnpm add -D vite`.

The server binds to `127.0.0.1` by default because it serves your entire project directory. Pass
`--host` only when you genuinely need it reachable from another machine.

```bash
# Serve the current directory on 127.0.0.1:4747
guideflow studio

# Custom port and root
guideflow studio --port 3000 --root ./packages/app
```

Press `Ctrl+C` to stop.

---

### `guideflow export`

Reads a flow file and writes JSON.

```bash
guideflow export [file] [options]
```

| Argument / Option | Default | Description |
|---|---|---|
| `[file]` | `my-tour.ts` | Path to the flow file (`.ts`, `.js` or `.json`) |
| `-o, --output <file>` | see below | Output path, used exactly as given (relative to your current directory, not to the input file) |
| `--pretty` | `false` | Pretty-print the output JSON |

Any other extension, or a missing file, exits with status 1.

**`.json` input** works: the file is parsed and re-serialised (minified, or indented with
`--pretty`). The contents are not validated against the `FlowDefinition` schema.

::: danger `-o` is not optional for JSON input
The implicit output path is the input path with a trailing `.ts`/`.js` replaced by `.flow.json`.
A `.json` input has nothing to replace, so the implicit output path **is the input path** —
`guideflow export my-tour.json` rewrites your source file in place. Always pass `-o` when exporting
JSON.
:::

**`.ts` / `.js` input does not produce a flow.** The command regex-scans the source for something
that looks like `{ id: '…' … states: {` and, if it matches, writes a stub:

```json
{
  "_note": "Static extraction was used. Review and complete this file.",
  "rawSnippet": "…the first 500 characters of the matched source text…"
}
```

That object has no `id`, no `initial` and no `states` — it is not a `FlowDefinition`, so nothing that
expects a flow can use it. (`guideflow push` will still upload it: it only checks that the file
parses as JSON.) The command prints a warning but exits 0. If the regex finds no match it exits 1.

To get a real JSON flow out of a TypeScript definition today, export the object from your flow
module and serialise it yourself — a `FlowDefinition` is plain data, so `JSON.stringify` is enough:

```ts
// tools/export-flow.ts — run with `npx tsx tools/export-flow.ts`
import { writeFileSync } from 'node:fs'

import type { FlowDefinition } from '@guideflow/core'

const welcomeTour: FlowDefinition = {
  id: 'welcome-tour',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'intro',
          target: '#app',
          content: { title: 'Welcome!', body: 'This is your first step.' },
        },
      ],
      final: true,
    },
  },
}

writeFileSync('welcome-tour.json', JSON.stringify(welcomeTour, null, 2))
```

```bash
# Working example: reformat an existing JSON flow to a new file
guideflow export ./flows/onboarding.json -o ./dist/flows/onboarding.json --pretty
```

---

### `guideflow push`

POSTs a flow JSON file to an HTTP endpoint.

```bash
guideflow push [file] [options]
```

| Argument / Option | Default | Description |
|---|---|---|
| `[file]` | `my-tour.flow.json` | Path to the flow JSON file |
| `-k, --api-key <key>` | — | **Required.** Sent as `Authorization: Bearer <key>` |
| `-e, --endpoint <url>` | `https://api.guideflow.dev/v1/flows` | Target URL |
| `--env <env>` | `production` | Sent as the `X-GuideFlow-Env` header |

::: warning Experimental — bring your own endpoint
The default endpoint, `https://api.guideflow.dev/v1/flows`, is a placeholder for a hosted service
that **has never been deployed**, so a `push` without `--endpoint` cannot succeed. Treat this
command as an experimental HTTP client for an API you host yourself.
:::

The request is a single `POST` with `Content-Type: application/json`, and the file's raw text as the
body. The file must parse as JSON — nothing else about it is validated. A non-2xx response prints
the status and body and exits 1. If the response JSON contains a `url` field it is printed.

`--api-key` is declared as a required option, so commander rejects the command before it runs when
the flag is missing. The `GUIDEFLOW_API_KEY` environment variable is named in the option's help text
but is **not** currently honoured — you must pass the flag.

```bash
guideflow push ./flows/onboarding.json \
  --endpoint https://tours.myapp.com/v1/flows \
  --api-key "$MY_API_KEY" \
  --env staging
```

---

## Global Options

| Option | Description |
|---|---|
| `-v, --version` | Print the CLI version |
| `-h, --help` | Show help for any command |

```bash
guideflow --version
guideflow studio --help
```
