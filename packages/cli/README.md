# @guideflow/cli

**Command-line helper for GuideFlow — scaffold starter files, serve your project, convert flow files to JSON, and POST a flow to an endpoint.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Companion CLI for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Requires Node.js >= 18.

> **Status: early and incomplete.** There is no visual tour editor yet — `studio` starts a Vite dev
> server, nothing more. `export` only produces a usable file from `.json` input. `push` targets an
> API you have to host yourself. See the limitations under each command before building a workflow
> on top of this package.

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
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` (+ `GuideFlowProvider.tsx` for React) into a directory |
| `guideflow studio` | Starts a Vite dev server on your project and injects one flag — no editor yet |
| `guideflow export` | Reformats a `.json` flow; emits a stub, not a flow, for `.ts`/`.js` |
| `guideflow push` | POSTs a flow JSON file to an endpoint you supply with `--endpoint` |

Full reference with every flag: <https://realnerdzw.github.io/GuideFlow/api/cli>

## Usage

### Initialize a project

```bash
guideflow init [--dir <directory>] [--framework react|vue|svelte|none]
```

Prompts for a framework (unless `--framework` is given) and for the output directory (always — even
when `--dir` is passed, which only pre-fills the answer, so `init` cannot run unattended). Writes:

- `guideflow.ts` — a `createGuideFlow({})` instance
- `my-tour.ts` — an example `FlowDefinition` (state-machine shape, second state `final: true`)
- `GuideFlowProvider.tsx` — React only; `vue` and `svelte` get no adapter file

Existing files with those names are overwritten without confirmation. Dependencies are not
installed; `init` prints the `pnpm add` command for you to run. No config file is created — nothing
in GuideFlow reads a project config file.

### Studio (dev server)

```bash
guideflow studio [-p <port>] [--root <dir>] [--host <host>]
```

Serves `--root` (default `.`) with Vite on port `4747`, bound to `127.0.0.1`, and injects
`window.__GUIDEFLOW_DEVTOOLS__ = true` before `</body>` of each HTML response. It does not open a
browser and it does not open an editor: **nothing reads that global**, so today the command is
`vite dev` plus an inert script tag. The visual editor has not been built.

Vite is an **optional peer dependency**. Projects that already have Vite need nothing extra; anyone
else is told to `pnpm add -D vite`. Binding stays on loopback because the server exposes your whole
project directory — pass `--host` only when you need remote access.

### Export flows

```bash
guideflow export [file] [-o <out>] [--pretty]
```

`[file]` defaults to `my-tour.ts`.

- **`.json` input** — parsed and re-serialised. Pass `-o`: without it the output path *is* the
  input path, so the command rewrites your source file in place.
- **`.ts` / `.js` input** — regex-scraped, then written as `{ "_note": …, "rawSnippet": … }`, a
  truncated slice of your source text. That is **not** a `FlowDefinition` and `push` cannot use it.
  Serialise the flow yourself (`JSON.stringify(flow, null, 2)`) until real extraction exists.

### Push to an endpoint

```bash
guideflow push [file] --api-key <key> --endpoint <url> [--env <env>]
```

`[file]` defaults to `my-tour.flow.json`. Sends one `POST` with the file's raw text as the body,
`Authorization: Bearer <key>` and `X-GuideFlow-Env: <env>` (default `production`).

`--api-key` is required — the `GUIDEFLOW_API_KEY` environment variable is mentioned in the help text
but is not honoured. The endpoint defaults to `https://api.guideflow.dev/v1/flows`, a placeholder for
a hosted service that **does not exist**, so `--endpoint` is effectively required too. Treat this
command as an experimental HTTP client for your own API.

## Related packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine
- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React adapter
- [`@guideflow/vue`](https://www.npmjs.com/package/@guideflow/vue) — Vue 3 adapter
- [`@guideflow/svelte`](https://www.npmjs.com/package/@guideflow/svelte) — Svelte adapter

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
