/**
 * `guideflow validate` — unit tests.
 *
 * The exit code is the whole contract: this command exists to run in CI, so
 * "did it exit 1" matters more than anything it printed.
 */
import { resolve } from 'node:path';

import type { Command } from 'commander';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  existsSync: vi.fn<[string], boolean>(),
  readFileSync: vi.fn<[string, string], string>(),
  statSync: vi.fn<[string], { isFile: () => boolean }>(),
}));

vi.mock('node:fs', () => fs);

class ProcessExited extends Error {
  public readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExited';
    this.code = code;
  }
}

let exitSpy: MockInstance<Parameters<typeof process.exit>, ReturnType<typeof process.exit>>;

async function freshCommand(): Promise<Command> {
  vi.resetModules();
  const mod = await import('../commands/validate.js');
  return mod.validateCommand;
}

async function run(args: string[]): Promise<void> {
  const cmd = await freshCommand();
  await cmd.parseAsync(args, { from: 'user' });
}

function file(contents: string): void {
  fs.existsSync.mockReturnValue(true);
  fs.statSync.mockReturnValue({ isFile: () => true });
  fs.readFileSync.mockReturnValue(contents);
}

const VALID = JSON.stringify({
  id: 'welcome',
  initial: 'a',
  states: {
    a: { steps: [{ id: 's1', target: '#a', content: { title: 'One' } }], final: true },
  },
});

beforeEach(() => {
  fs.existsSync.mockReset();
  fs.readFileSync.mockReset();
  fs.statSync.mockReset();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExited(typeof code === 'number' ? code : 0);
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const said = (): string =>
  [
    ...(console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls,
  ]
    .flat()
    .join(' ');

describe('validateCommand', () => {
  it('exits 0 on a clean flow', async () => {
    file(VALID);
    await run(['welcome.flow.json']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 0 on warnings, because a warning still runs', async () => {
    // No final state: measured, the engine completes such a flow normally.
    file(
      JSON.stringify({
        id: 'w',
        initial: 'a',
        states: { a: { steps: [{ id: 's1', target: '#a', content: { title: 'One' } }] } },
      }),
    );
    await run(['w.flow.json']);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(said()).toContain('final');
  });

  it('exits 1 on warnings under --strict', async () => {
    file(
      JSON.stringify({
        id: 'w',
        initial: 'a',
        states: { a: { steps: [{ id: 's1', target: '#a', content: { title: 'One' } }] } },
      }),
    );
    await expect(run(['w.flow.json', '--strict'])).rejects.toThrow(ProcessExited);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 on an error, and prints the fix', async () => {
    file(
      JSON.stringify({
        id: 'broken',
        initial: 'a',
        states: { a: { steps: [{ id: 's', content: { title: 't' } }], on: { NEXT: 'ghost' } } },
      }),
    );
    await expect(run(['broken.flow.json'])).rejects.toThrow(ProcessExited);
    expect(exitSpy).toHaveBeenCalledWith(1);
    // The hint is the deliverable — it must reach the terminal.
    expect(said()).toContain('→');
  });

  it('exits 1 on unparseable JSON rather than throwing', async () => {
    file('{ not json ]');
    await expect(run(['bad.flow.json'])).rejects.toThrow(ProcessExited);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 on a missing file and names it', async () => {
    fs.existsSync.mockReturnValue(false);
    await expect(run(['absent.flow.json'])).rejects.toThrow(ProcessExited);
    expect(said()).toContain('absent.flow.json');
  });

  it('checks every file it is given', async () => {
    file(VALID);
    await run(['a.flow.json', 'b.flow.json']);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).toHaveBeenCalledWith(resolve('b.flow.json'), 'utf-8');
  });

  it('accepts the envelope written by `guideflow export`', async () => {
    file(JSON.stringify({ gfFlowFile: 1, flow: JSON.parse(VALID) as unknown }));
    await run(['welcome.flow.json']);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
