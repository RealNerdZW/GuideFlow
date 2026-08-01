/**
 * `guideflow` entry point — unit tests.
 *
 * `src/index.ts` builds its Command tree and calls `program.parseAsync` at
 * module scope, and exports nothing. So the only way to observe it is to set
 * `process.argv`, import it, and read what it wrote to the tty. Each test does
 * that against a fresh module registry.
 *
 * Note the `process.exit` stub here deliberately does *not* throw (unlike the
 * command tests): index.ts installs a `.catch` that logs and exits again, and a
 * throwing stub would turn that into an unhandled rejection. A no-op stub lets
 * commander run to completion harmlessly — it only ever prints help twice.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Importing the entry point pulls in every command module, and validate.ts imports
// `vite` at module scope — a hard runtime dependency of @guideflow/cli (audit
// finding `cli-ships-vite-as-runtime-dependency`). Loading it once per test,
// with a reset module registry each time, took ~7s and timed out under parallel
// turbo load. These commands are exercised by their own spec files; here we only
// care about the program's argument surface, so the heavy deps are stubbed.
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string };

const SUBCOMMANDS = ['init', 'validate', 'export'] as const;

let written: string[];
let argv: string[];

/**
 * Everything the program printed, on either stream, with whitespace collapsed —
 * commander hard-wraps help text at the terminal width, so assertions must not
 * depend on where a description happens to break.
 */
function output(): string {
  return written.join('').replace(/\s+/g, ' ');
}

/** Import the CLI entry point with a clean module registry. */
async function runCli(args: string[]): Promise<void> {
  vi.resetModules();
  process.argv = ['node', 'guideflow', ...args];
  await import('../index.js');
  // Let the parseAsync promise chain settle before assertions.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  written = [];
  argv = process.argv;

  const capture = (chunk: Uint8Array | string): boolean => {
    written.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = argv;
});

describe('guideflow program', () => {
  it('lists every subcommand in --help', async () => {
    await runCli(['--help']);

    const help = output();
    expect(help).toContain('Usage: guideflow');
    expect(help).toContain('AI-powered product tours');
    for (const name of SUBCOMMANDS) {
      expect(help).toContain(name);
    }
  });

  it('describes each subcommand in --help', async () => {
    await runCli(['--help']);

    const help = output();
    expect(help).toContain('Scaffold a new GuideFlow configuration in your project');
    expect(help).toContain('Validate flow files');
    // `studio` and `push` used to advertise "a local visual tour editor" and
    // "GuideFlow Cloud". Neither ever existed, and both commands are now
    // deleted rather than merely re-worded. --help is documentation too.
    expect(help).not.toContain('visual tour editor');
    expect(help).not.toContain('GuideFlow Cloud');
    expect(help).not.toContain('push');
  });

  it('prints the package version for -v', async () => {
    await runCli(['-v']);

    expect(output()).toContain(pkg.version);
  });

  it('prints the package version for --version', async () => {
    await runCli(['--version']);

    expect(output()).toContain(pkg.version);
  });

  it('prints help when invoked with no arguments', async () => {
    await runCli([]);

    expect(output()).toContain('Usage: guideflow');
  });

  it('reports an unknown subcommand rather than silently succeeding', async () => {
    await runCli(['nope']);

    expect(output()).toContain('nope');
  });
});
