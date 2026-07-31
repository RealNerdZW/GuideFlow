---
description: "@guideflow/cli — Command-line helper for GuideFlow: scaffold starter files, serve your project with Vite, convert flow files to JSON, and POST a flow to your own API."
keywords: "@guideflow/cli, GuideFlow CLI, scaffold product tour, guideflow init, guideflow export"
---

# @guideflow/cli

**Command-line helper for GuideFlow — scaffold starter files, serve your project, convert flow files to JSON, and POST a flow to an endpoint.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)

::: warning Early and incomplete
There is no visual tour editor yet: `guideflow studio` starts a Vite dev server and nothing more.
`guideflow export` only produces a usable file from `.json` input, and `guideflow push` needs an API
you host yourself. Check the [CLI reference](/api/cli) for each command's limitations before
depending on it.
:::

## Installation

```bash
npm install -g @guideflow/cli
```

Requires Node.js >= 18. Vite is an optional peer dependency, needed only by `guideflow studio`.

## Commands

| Command | What it actually does |
|---------|-----------------------|
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` (+ `GuideFlowProvider.tsx` for React) into a directory |
| `guideflow studio` | Serves your project with Vite on `127.0.0.1:4747` and injects one (currently unread) global |
| `guideflow export` | Reformats a `.json` flow; emits a stub, not a flow, for `.ts`/`.js` input |
| `guideflow push` | POSTs a flow JSON file to the endpoint given by `--endpoint` |

See the [CLI reference](/api/cli) for every flag, default and caveat.

## Links

- [npm](https://www.npmjs.com/package/@guideflow/cli)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/cli)
