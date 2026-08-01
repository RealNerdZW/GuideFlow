---
description: "@guideflow/cli — Command-line helper for GuideFlow: scaffold starter files, validate flow files in CI, and normalise a flow to JSON."
keywords: "@guideflow/cli, GuideFlow CLI, scaffold product tour, guideflow init, guideflow validate, guideflow export"
---

# @guideflow/cli

**Command-line helper for GuideFlow — scaffold starter files, validate flow files, and normalise a flow to JSON.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)

::: warning Know what each command does
`validate` is the command built for CI, `export` runs the same validator, and `init` runs unattended
with `--yes`. Check the [CLI reference](/api/cli) for each command's limitations before depending on
it. Shipping a flow is not a CLI job — see [Hosting flows](/guide/hosting-flows).
:::

## Installation

```bash
npm install -g @guideflow/cli
```

Requires Node.js >= 18. No optional peer dependencies.

## Commands

Three of them.

| Command | What it actually does |
|---------|-----------------------|
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` and one framework file into a directory. `--yes` for CI; existing files are skipped unless `--force` |
| `guideflow export` | Validates a `.json` flow and rewrites it as a pretty-printed flow file; refuses to write an invalid one |
| `guideflow validate` | Checks flow files and prints every issue with its fix. `--strict` fails on warnings too |

See the [CLI reference](/api/cli) for every flag, default and caveat.

## Links

- [npm](https://www.npmjs.com/package/@guideflow/cli)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/cli)
