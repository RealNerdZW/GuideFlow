---
description: "@guideflow/cli — Command-line helper for GuideFlow: scaffold starter files, validate flow files in CI, normalise a flow to JSON, and POST a flow to your own API."
keywords: "@guideflow/cli, GuideFlow CLI, scaffold product tour, guideflow init, guideflow validate, guideflow export"
---

# @guideflow/cli

**Command-line helper for GuideFlow — scaffold starter files, validate flow files, normalise a flow to JSON, and POST a flow to an endpoint.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)

::: warning Not everything here is automatable
`guideflow push` needs an API you host yourself, and there is no hosted service. `validate` is the
command built for CI, `export` runs the same validator, and `init` runs unattended with `--yes`.
Check the [CLI reference](/api/cli) for each command's limitations before depending on it.
:::

## Installation

```bash
npm install -g @guideflow/cli
```

Requires Node.js >= 18. No optional peer dependencies.

## Commands

| Command | What it actually does |
|---------|-----------------------|
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` and one framework file into a directory. `--yes` for CI; existing files are skipped unless `--force` |
| `guideflow export` | Validates a `.json` flow and rewrites it as a pretty-printed flow file; refuses to write an invalid one |
| `guideflow validate` | Checks flow files and prints every issue with its fix. `--strict` fails on warnings too |
| `guideflow push` | POSTs a flow JSON file to the endpoint given by `--endpoint` |

See the [CLI reference](/api/cli) for every flag, default and caveat.

## Links

- [npm](https://www.npmjs.com/package/@guideflow/cli)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/cli)
