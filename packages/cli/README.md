# @guideflow/cli

**Command-line helper for GuideFlow — scaffold starter files, validate flow files, normalise a flow to JSON, and POST a flow to an endpoint.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Companion CLI for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Requires Node.js >= 18.

> **Not everything here is automatable.** `push` targets an API you have to host yourself, and there
> is no hosted service. `validate` is the command built for CI, `export` runs the same validator, and
> `init` runs unattended with `--yes`. See the limitations under each command before building a
> workflow on top of this package.

## Installation

```bash
# Global install
npm install -g @guideflow/cli

# Or use via npx
npx @guideflow/cli init
```

## Commands

| Command | What it actually does |
|---------|-----------------------|
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` and one framework file into a directory. `--yes` for CI; existing files are skipped unless `--force` |
| `guideflow export` | Validates a `.json` flow and rewrites it as a pretty-printed flow file; refuses to write an invalid one |
| `guideflow validate` | Checks flow files and prints every issue with its fix. `--strict` fails on warnings too |
| `guideflow push` | POSTs a flow JSON file to an endpoint you supply with `--endpoint` |

Full reference with every flag: <https://realnerdzw.github.io/GuideFlow/api/cli>

## Usage

### Initialize a project

```bash
guideflow init [--dir <directory>] [--framework react|vue|svelte|none] [--yes] [--force]
```

Prompts only for what it does not already know, and does not prompt at all under `--yes` or a
non-TTY stdout — so it runs unattended in CI. Writes:

- `guideflow.ts` — a `createGuideFlow({})` instance
- `my-tour.ts` — an example `FlowDefinition` (state-machine shape, second state `final: true`)
- one framework file: `GuideFlowProvider.tsx` (React), `guideflow-plugin.ts` (Vue) or
  `guideflow-store.ts` (Svelte). `--framework none` writes neither.

Existing files are left alone and reported as skipped; `--force` overwrites them. Dependencies are
not installed; `init` prints the `pnpm add` command for you to run. No config file is created —
nothing in GuideFlow reads a project config file.

### Export flows

```bash
guideflow export [file] [-o <out>] [--force]
```

Reads **`.json` only**, validates it, and writes it back in the one on-disk flow-file format. A flow
with any error is not written — the command prints every issue and exits 1. The output is always
pretty-printed; `--pretty` is accepted as a no-op. `[file]` still defaults to `my-tour.ts`, so a bare
`guideflow export` exits 1 — pass the `.json` path you mean.

It refuses to overwrite the input file, and refuses to overwrite an existing output file without
`--force`.

**`.ts` / `.js` input is an error.** A flow written in TypeScript is code, so export it from code —
the error message points you at the same three lines:

```ts
import { writeFileSync } from 'node:fs'

import { stringifyFlowFile } from '@guideflow/core/authoring'

import { flow } from './my-tour.js'

writeFileSync('my-tour.flow.json', stringifyFlowFile(flow))
```

### Validate flows

```bash
guideflow validate <files...> [--strict]
```

Checks one or more flow files and prints every issue with its severity, its path into the flow, and
the fix on a `→` line. Nothing is repaired and nothing is written.

Exit codes are the contract, because the point is CI: **0** when there are no errors (warnings are
allowed), **1** on any error or a file that could not be read. `--strict` also fails on warnings.

```json
{ "scripts": { "lint:flows": "guideflow validate flows/*.flow.json --strict" } }
```

Worth running: the engine's only runtime check is that `flow.initial` names a real state. A
transition pointing at a state that does not exist emits one `console.warn` and then fires
`tour:complete` — the tour truncates *and* is recorded as completed, so it never shows again.
Nothing throws.

### Push to an endpoint

```bash
guideflow push [file] --api-key <key> --endpoint <url> [--env <env>]
```

`[file]` defaults to `my-tour.flow.json`. Sends one `POST` with the file's raw text as the body,
`Authorization: Bearer <key>` and `X-GuideFlow-Env: <env>` (default `production`).

A key is required, but the flag is not: `--api-key` falls back to `GUIDEFLOW_API_KEY`, and the command
exits 1 only when neither is set. Prefer the environment variable — a key on the command line lands in
shell history and process listings. The endpoint defaults to `https://api.guideflow.dev/v1/flows`, a
placeholder for a hosted service that **does not exist**, so `--endpoint` is effectively required.
Treat this command as an experimental HTTP client for your own API.

## Related packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine
- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React adapter
- [`@guideflow/vue`](https://www.npmjs.com/package/@guideflow/vue) — Vue 3 adapter
- [`@guideflow/svelte`](https://www.npmjs.com/package/@guideflow/svelte) — Svelte adapter

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
