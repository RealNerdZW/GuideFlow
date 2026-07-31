/**
 * `guideflow init` — unit tests.
 *
 * `init` writes files into the user's project, so every `node:fs` call is
 * mocked: no test may create a real directory or file. `inquirer` is mocked too
 * — the real prompt would hang waiting for stdin.
 *
 * The mocks are hoisted so the same instances survive the `vi.resetModules()`
 * that gives each run a pristine Command (commander caches option values on the
 * instance).
 */
import { join } from 'node:path';

import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  existsSync: vi.fn<[string], boolean>(),
  mkdirSync: vi.fn<[string, { recursive?: boolean }?], undefined>(),
  writeFileSync: vi.fn<[string, string, string], void>(),
}));

const prompt = vi.hoisted(() =>
  vi.fn<[unknown], Promise<{ framework?: string; outputDir: string }>>(),
);

vi.mock('node:fs', () => fs);
vi.mock('inquirer', () => ({ default: { prompt } }));

const OUT = './src/tours';

async function runInit(args: string[]): Promise<void> {
  vi.resetModules();
  const mod: { initCommand: Command } = await import('../commands/init.js');
  await mod.initCommand.parseAsync(args, { from: 'user' });
}

/** Every path `init` wrote, in order. */
function writtenPaths(): string[] {
  return fs.writeFileSync.mock.calls.map((call) => call[0]);
}

/** The contents written to `<outputDir>/<name>`, if any. */
function contentsOf(name: string): string | undefined {
  return fs.writeFileSync.mock.calls.find((call) => call[0] === join(OUT, name))?.[1];
}

beforeEach(() => {
  fs.existsSync.mockReset();
  fs.mkdirSync.mockReset();
  fs.writeFileSync.mockReset();
  prompt.mockReset();
  prompt.mockResolvedValue({ outputDir: OUT });

  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `existsSync` is now asked two different questions: does the target directory
 * exist, and does each file we are about to write already exist. A blanket
 * `true` conflated them, so every write looked like an overwrite and was
 * skipped — which is exactly the protection `init` gained
 * (AUDIT `init-clobbers-existing-files`).
 */
function dirExistsFilesDoNot(): void {
  fs.existsSync.mockImplementation((p: string) => p === OUT);
}

describe('initCommand', () => {
  it('scaffolds config, tour and provider for React', async () => {
    dirExistsFilesDoNot();

    await runInit(['--framework', 'react']);

    expect(writtenPaths()).toEqual([
      join(OUT, 'guideflow.ts'),
      join(OUT, 'my-tour.ts'),
      join(OUT, 'GuideFlowProvider.tsx'),
    ]);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('scaffolds a plugin file for Vue', async () => {
    dirExistsFilesDoNot();

    await runInit(['--framework', 'vue']);

    // `--framework vue` used to write no framework file at all and still report
    // success (AUDIT `init-vue-svelte-scaffold-nothing`).
    expect(writtenPaths()).toEqual([
      join(OUT, 'guideflow.ts'),
      join(OUT, 'my-tour.ts'),
      join(OUT, 'guideflow-plugin.ts'),
    ]);
  });

  it('scaffolds a store file for Svelte', async () => {
    dirExistsFilesDoNot();

    await runInit(['--framework', 'svelte']);

    expect(writtenPaths()).toEqual([
      join(OUT, 'guideflow.ts'),
      join(OUT, 'my-tour.ts'),
      join(OUT, 'guideflow-store.ts'),
    ]);
  });

  it('omits any framework file for --framework none', async () => {
    dirExistsFilesDoNot();

    await runInit(['--framework', 'none']);

    expect(writtenPaths()).toEqual([join(OUT, 'guideflow.ts'), join(OUT, 'my-tour.ts')]);
  });

  it('refuses to clobber an existing file unless --force is passed', async () => {
    // Everything already exists.
    fs.existsSync.mockReturnValue(true);

    await runInit(['--framework', 'none']);
    expect(writtenPaths()).toEqual([]);

    fs.writeFileSync.mockClear();
    await runInit(['--framework', 'none', '--force']);
    expect(writtenPaths()).toEqual([join(OUT, 'guideflow.ts'), join(OUT, 'my-tour.ts')]);
  });

  it('creates the target directory when it does not exist', async () => {
    fs.existsSync.mockReturnValue(false);

    await runInit(['--framework', 'none']);

    expect(fs.mkdirSync).toHaveBeenCalledWith(OUT, { recursive: true });
  });

  it('skips the framework prompt when --framework is passed', async () => {
    fs.existsSync.mockReturnValue(true);

    await runInit(['--framework', 'react']);

    const questions = prompt.mock.calls[0]?.[0] as Array<{ name: string; when?: boolean }>;
    const frameworkQuestion = questions.find((q) => q.name === 'framework');
    expect(frameworkQuestion?.when).toBe(false);
  });

  it('offers --dir as the default answer for the output directory', async () => {
    fs.existsSync.mockReturnValue(true);

    await runInit(['--framework', 'react', '--dir', './custom']);

    const questions = prompt.mock.calls[0]?.[0] as Array<{ name: string; default?: string }>;
    expect(questions.find((q) => q.name === 'outputDir')?.default).toBe('./custom');
  });

  /**
   * The scaffolded tour is the first flow most users ever see. A flat
   * `{ id, steps: [] }` object is not a valid FlowDefinition, and a flow with no
   * `final: true` state can never complete — so pin the FSM shape here.
   */
  it('scaffolds a state-machine flow that can reach a final state', async () => {
    dirExistsFilesDoNot();

    await runInit(['--framework', 'react']);

    const tour = contentsOf('my-tour.ts') ?? '';
    expect(tour).toContain('FlowDefinition');
    expect(tour).toContain('initial:');
    expect(tour).toContain('states:');
    expect(tour).toContain('final: true');

    const config = contentsOf('guideflow.ts') ?? '';
    expect(config).toContain("from '@guideflow/core'");
    expect(config).toContain('createGuideFlow');
  });
});
