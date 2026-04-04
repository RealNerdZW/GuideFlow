# @guideflow/cli

**CLI for GuideFlow — scaffold, build, export, and publish product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/cli.svg)](https://www.npmjs.com/package/@guideflow/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)

Command-line tool for [GuideFlow](https://github.com/johnmugabe/GuideFlow). Scaffold configurations, launch the visual tour editor, export flow definitions, and publish to GuideFlow Cloud.

## Installation

```bash
# Global install
npm install -g @guideflow/cli

# Or use via npx
npx @guideflow/cli init
```

## Commands

| Command | Description |
|---------|-------------|
| `guideflow init` | Scaffold a `guideflow.config.ts` and example flow in your project |
| `guideflow studio` | Launch the visual tour editor in your browser |
| `guideflow export` | Export flow definitions to JSON files |
| `guideflow push` | Publish flows to GuideFlow Cloud |

## Usage

### Initialize a Project

```bash
guideflow init
```

Prompts you to select a framework (React, Vue, Svelte, or vanilla JS) and creates a starter configuration with an example tour flow.

### Visual Tour Editor

```bash
guideflow studio
```

Opens a local development server with the visual tour builder where you can create and edit tours interactively.

### Export Flows

```bash
guideflow export
```

Exports all flow definitions to JSON format, suitable for version control or deployment.

### Push to Cloud

```bash
guideflow push
```

Publishes your flow definitions to GuideFlow Cloud for remote management.

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine
- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React adapter
- [`@guideflow/vue`](https://www.npmjs.com/package/@guideflow/vue) — Vue 3 adapter
- [`@guideflow/svelte`](https://www.npmjs.com/package/@guideflow/svelte) — Svelte adapter

## License

[MIT](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)
