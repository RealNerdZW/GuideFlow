---
description: "GuideFlow CLI reference — init, studio, export, and push commands for @guideflow/cli."
keywords: GuideFlow CLI, guideflow init, guideflow studio, guideflow export, guideflow push, @guideflow/cli
---

# CLI Reference

`@guideflow/cli` provides the `guideflow` command for scaffolding, visual editing, and publishing tour flows.

## Installation

```bash
# Install globally
npm install -g @guideflow/cli

# Or run without installing
npx @guideflow/cli <command>
```

## Commands

### `guideflow init`

Scaffolds GuideFlow configuration files into an existing project.

```bash
guideflow init [options]
```

Running `init` starts an interactive prompt that asks for your framework (React, Vue, Svelte, Vanilla) and generates the appropriate boilerplate:

- `src/guideflow.ts` — core instance configuration
- `src/flows/welcome-tour.ts` — example flow definition
- Framework-specific wrapper (e.g. `TourProvider` for React)

```bash
# Scaffold into the current directory
guideflow init

# Scaffold into a specific directory
guideflow init --dir ./src
```

---

### `guideflow studio`

Launches a local visual tour editor powered by Vite and the GuideFlow DevTools panel.

```bash
guideflow studio [options]
```

| Option           | Default | Description |
|------------------|---------|-------------|
| `-p, --port <port>` | `4747` | Port to run the Studio server on |
| `--root <dir>`   | `.`     | Project root directory to serve |

```bash
# Start Studio on the default port
guideflow studio

# Use a custom port and root
guideflow studio --port 3000 --root ./packages/app
```

Opens the Studio at `http://localhost:4747`. Press `Ctrl+C` to stop.

---

### `guideflow export`

Exports a flow definition to a standalone JSON file.

```bash
guideflow export [options]
```

| Option            | Default              | Description |
|-------------------|----------------------|-------------|
| `--flow <id>`     | —                    | ID of the flow to export |
| `--out <file>`    | `guideflow-export.json` | Output file path |
| `--config <file>` | `guideflow.config.ts` | Path to the GuideFlow config file |

```bash
guideflow export --flow onboarding --out ./dist/flows/onboarding.json
```

---

### `guideflow push`

Publishes a flow definition to GuideFlow Cloud or a self-hosted GuideFlow API.

```bash
guideflow push [options]
```

| Option            | Default | Description |
|-------------------|---------|-------------|
| `--flow <id>`     | —       | ID of the flow to push |
| `--api <url>`     | —       | Target API base URL |
| `--token <token>` | —       | API authentication token (or set `GUIDEFLOW_TOKEN` env var) |

```bash
# Push using environment variable for the token
export GUIDEFLOW_TOKEN=my-secret-token
guideflow push --flow onboarding --api https://tours.myapp.com
```

---

## Global Options

| Option         | Description |
|----------------|-------------|
| `-v, --version` | Print the CLI version |
| `-h, --help`    | Show help for any command |

```bash
guideflow --version
guideflow studio --help
```
