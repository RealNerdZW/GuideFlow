---
description: "GuideFlow CLI reference — the real flags for guideflow init, export and validate in @guideflow/cli, including their current limitations."
keywords: GuideFlow CLI, guideflow init, guideflow export, guideflow validate, @guideflow/cli
---

# CLI Reference

`@guideflow/cli` provides the `guideflow` command for scaffolding starter files, and for normalising
and validating flow files. Three commands: `init`, `export` and `validate`.

::: warning Status
`validate` is the command built for CI, and `export` runs the same validator. `init` prompts by
default but takes `--yes` for unattended use. Read each command's limitations before you build a
workflow around it.
:::

Shipping a flow is not a CLI concern: a `.flow.json` is a static asset you serve from your own CDN.
See [Hosting flows](/guide/hosting-flows).

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
| `-y, --yes` | `false` | Accept the defaults and never prompt |
| `--force` | `false` | Overwrite files that already exist |

Each prompt is skipped when its answer is already known, and prompting is suppressed entirely by
`--yes` **or** by a non-TTY stdout — so `init` runs unattended in CI.

Files written into the chosen directory:

- `guideflow.ts` — creates and exports a `createGuideFlow({})` instance
- `my-tour.ts` — an example `FlowDefinition` with two states, the second `final: true`
- one framework file, chosen by `--framework`: `GuideFlowProvider.tsx` (React, a `TourProvider`
  wrapper), `guideflow-plugin.ts` (Vue, an `installGuideFlow(app)` helper) or `guideflow-store.ts`
  (Svelte, a `createTourStore` export). `--framework none` writes only the two files above.

**Existing files are left alone**, listed as skipped, and overwritten only with `--force`; when every
file already exists the command writes nothing and says so. No `package.json` is modified and no
dependencies are installed — `init` prints the `pnpm add` line for you to run yourself.

```bash
# Scaffold into the current directory
guideflow init

# Pre-fill the directory prompt and skip the framework question
guideflow init --dir ./src --framework react

# Unattended
guideflow init --dir ./src --framework vue --yes
```

There is no `guideflow.config.ts`. No GuideFlow command reads a project config file; every command
takes its input on the command line.

---

### `guideflow export`

Normalises a flow file into the one on-disk format, validating it on the way through.

```bash
guideflow export [file] [options]
```

| Argument / Option | Default | Description |
|---|---|---|
| `[file]` | `my-tour.ts` | Path to the flow file. **`.json` only** — see below |
| `-o, --output <file>` | the input path with its extension replaced by `.flow.json` | Output path, used exactly as given (relative to your current directory, not to the input file) |
| `--pretty` | — | Accepted and ignored; the output is always pretty-printed |
| `--force` | `false` | Overwrite the output file if it already exists |

The file is read with `parseFlowFile`, graded by the same validator `guideflow validate` runs, and
written back with `stringifyFlowFile` — all three from
[`@guideflow/core/authoring`](/guide/authoring). Every issue found is printed, and **a flow with
any error is not written**: the command prints `Refusing to export an invalid flow` and exits 1.

Output is always pretty-printed, because a flow file lives in a repo and is read in diffs.
`--pretty` is accepted as a no-op so existing scripts keep working.

The command refuses to overwrite the input file, and refuses to overwrite an existing output file
unless `--force` is passed. A missing file exits 1.

::: warning `.ts` and `.js` input is now an error
Only `.json` is read. The default argument is still `my-tour.ts`, so a bare `guideflow export` with
no file exits 1 — pass the `.json` path you mean.

If you have a file on disk shaped like `{ "_note": …, "rawSnippet": … }`, that is the output of the
old `.ts`/`.js` path: a 500-character slice of your own source text with no `id`, no `initial` and
no `states`. It is not a flow. Regenerate it with the snippet below.

A flow written in TypeScript is code, so export it from code — the error message points you at the
same three lines:

```ts
import { writeFileSync } from 'node:fs'

import { stringifyFlowFile } from '@guideflow/core/authoring'

import { flow } from './my-tour.js'

writeFileSync('my-tour.flow.json', stringifyFlowFile(flow))
```
:::

```bash
# Normalise and validate an existing JSON flow into a new file
guideflow export ./flows/onboarding.json -o ./dist/flows/onboarding.flow.json
```

---

### `guideflow validate`

Checks flow files and reports what is wrong with them. Built for CI.

```bash
guideflow validate <files...> [options]
```

| Argument / Option | Default | Description |
|---|---|---|
| `<files...>` | — | **Required.** One or more flow files to check |
| `--strict` | `false` | Treat warnings as errors |

Each file is read with `parseFlowFile` and graded by `validateFlow` from
[`@guideflow/core/authoring`](/guide/authoring). Nothing is repaired and nothing is written — the
command only reports. Every issue prints its severity, its path into the flow, the problem, and the
fix on a `→` line:

```
  ✗ flows/checkout.flow.json — 1 error(s), 1 warning(s)
    error states.support.on.NEXT
      Transition "NEXT" points at "confirmation", which is not a state. The tour stops there AND is recorded as completed, so it never shows again.
      → Point it at one of: cart, payment, support.
    warn  states
      No state is marked `final: true`.
      → The tour still completes when it runs out of steps, but marking the last state final says so explicitly and fixes the step counter.

  1 error(s), 1 warning(s) across 1 file(s)
```

A clean file reports what it found, so a passing run is not silence:

```
  ✓ flows/welcome.flow.json — welcome, 2 state(s)

  1 file(s) valid, 0 warning(s)
```

#### Exit codes are the contract

| | exit 0 | exit 1 |
|---|---|---|
| default | no errors; warnings allowed | any error, or a file that could not be read |
| `--strict` | no errors **and** no warnings | any error, any warning, or a file that could not be read |

The reason to run this at all: the engine's only runtime check is that `flow.initial` names a real
state. A transition pointing at a state that does not exist emits one `console.warn` and then fires
`tour:complete` — the tour truncates *and* is recorded as completed, so it never shows again.
Nothing throws. See [Authoring](/guide/authoring) for the rules and the severity each one carries.

```bash
# Every flow in the repo, warnings included
guideflow validate flows/*.flow.json --strict
```

```json
{ "scripts": { "lint:flows": "guideflow validate flows/*.flow.json --strict" } }
```

```yaml
# .github/workflows/ci.yml
- run: npx @guideflow/cli validate flows/*.flow.json --strict
```

---

## Global Options

| Option | Description |
|---|---|
| `-v, --version` | Print the CLI version |
| `-h, --help` | Show help for any command |

```bash
guideflow --version
guideflow validate --help
```
