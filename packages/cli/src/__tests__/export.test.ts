/**
 * `guideflow export` — unit tests.
 *
 * Nothing here touches the real filesystem: `node:fs` is replaced with hoisted
 * mocks so the same mock instances survive the `vi.resetModules()` we do before
 * every run (commander stores parsed option values on the Command instance, so
 * a shared instance would leak `--pretty` / `-o` between tests).
 */
import { resolve } from 'node:path';

import type { Command } from 'commander';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  existsSync: vi.fn<[string], boolean>(),
  readFileSync: vi.fn<[string, string], string>(),
  writeFileSync: vi.fn<[string, string, string], void>(),
}));

vi.mock('node:fs', () => fs);

/** Thrown by the `process.exit` stub so a test can assert on the exit code. */
class ProcessExited extends Error {
  public readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExited';
    this.code = code;
  }
}

let exitSpy: MockInstance<Parameters<typeof process.exit>, ReturnType<typeof process.exit>>;

/** Fresh Command instance per run — see the file header. */
async function freshExportCommand(): Promise<Command> {
  vi.resetModules();
  const mod = await import('../commands/export.js');
  return mod.exportCommand;
}

async function runExport(args: string[]): Promise<void> {
  const cmd = await freshExportCommand();
  await cmd.parseAsync(args, { from: 'user' });
}

/** The `[path, contents]` of the single write the command performed. */
function writtenFile(): [string | undefined, string | undefined] {
  const call = fs.writeFileSync.mock.calls[0] ?? [];
  return [call[0], call[1]];
}

const FLOW_JSON = '{\n  "id": "welcome",\n  "initial": "s1",\n  "states": {}\n}';

const FLOW_TS = `import type { FlowDefinition } from '@guideflow/core';

export const welcomeTour: FlowDefinition = {
  id: 'welcome',
  initial: 's1',
  states: {
    s1: { steps: [], final: true },
  },
};
`;

beforeEach(() => {
  fs.existsSync.mockReset();
  fs.readFileSync.mockReset();
  fs.writeFileSync.mockReset();

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExited(typeof code === 'number' ? code : 0);
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `existsSync` now answers two questions: does the INPUT exist, and does the
 * OUTPUT already exist. A blanket `true` conflated them, so every export
 * looked like it was about to clobber an existing file and bailed — which is
 * the protection export gained (AUDIT `export-overwrites-json-source-file`).
 */
function onlyInputExists(input: string): void {
  fs.existsSync.mockImplementation((p: string) => p === resolve(input));
}
describe('exportCommand — JSON input', () => {
  it('round-trips a .json flow to the --output path', async () => {
    onlyInputExists('flow.json');
    fs.readFileSync.mockReturnValue(FLOW_JSON);

    await runExport(['flow.json', '-o', 'out.json']);

    expect(fs.readFileSync).toHaveBeenCalledWith(resolve('flow.json'), 'utf-8');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const [outPath, contents] = writtenFile();
    // `--output` is used verbatim, not resolved against cwd.
    expect(outPath).toBe('out.json');
    expect(contents).toBe('{"id":"welcome","initial":"s1","states":{}}');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('pretty-prints with --pretty', async () => {
    onlyInputExists('flow.json');
    fs.readFileSync.mockReturnValue(FLOW_JSON);

    await runExport(['flow.json', '-o', 'out.json', '--pretty']);

    const [, contents] = writtenFile();
    expect(contents).toContain('\n  "id": "welcome"');
    expect(JSON.parse(contents ?? '')).toEqual({ id: 'welcome', initial: 's1', states: {} });
  });

  /*
   * Regression for `export-overwrites-json-source-file`.
   *
   * `outPath` used to be `opts.output ?? src.replace(/\.(ts|js)$/, '.flow.json')`.
   * For a `.json` input that regex never matched, so the fallback resolved to
   * the *input path* and `guideflow export foo.json` rewrote the user's own
   * source file in place — minified, unless --pretty was passed.
   */
  it('never writes back over the input file when -o is omitted', async () => {
    onlyInputExists('flow.json');
    fs.readFileSync.mockReturnValue(FLOW_JSON);

    await runExport(['flow.json']);

    const [outPath] = writtenFile();
    expect(outPath).not.toBe(resolve('flow.json'));
    expect(outPath).toBe(resolve('flow') + '.flow.json');
  });

  it('refuses to overwrite an existing output unless --force is passed', async () => {
    // Both the input and the derived output already exist.
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(FLOW_JSON);

    await expect(runExport(['flow.json'])).rejects.toThrow(ProcessExited);
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    await runExport(['flow.json', '--force']);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('exportCommand — TypeScript / JavaScript input', () => {
  /*
   * RECORDED, NOT ENDORSED — audit finding `export-ts-js-emits-stub`.
   *
   * This pins what the command does *today*: it regex-scrapes the source and
   * writes `{ _note, rawSnippet }` — a truncated slice of raw source text, not a
   * FlowDefinition. The assertions below describe that output; they are not a
   * statement that it is correct. See the `it.skip` beneath for the behaviour
   * this command is documented to have.
   */
  it('writes a truncated raw-source stub for .ts input (current behaviour)', async () => {
    onlyInputExists('my-tour.ts');
    fs.readFileSync.mockReturnValue(FLOW_TS);

    await runExport(['my-tour.ts']);

    const [outPath, contents] = writtenFile();
    expect(outPath).toBe(resolve('my-tour.flow.json'));

    const parsed = JSON.parse(contents ?? '') as { _note?: string; rawSnippet?: string };
    expect(parsed._note).toContain('Static extraction');
    expect(parsed.rawSnippet).toContain("id: 'welcome'");
    // The emitted object is *not* a FlowDefinition — no id / initial / states.
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('states');
    // The user is warned, and the command still reports success.
    expect(console.warn).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  /*
   * SKIPPED — audit finding `export-ts-js-emits-stub`. The command's own
   * description ("Export a flow definition to JSON") and README promise a
   * portable FlowDefinition consumable by GuideFlow Cloud and the DevTools
   * import. This is that contract.
   */
  it.skip('emits a real FlowDefinition for .ts input', async () => {
    onlyInputExists('my-tour.ts');
    fs.readFileSync.mockReturnValue(FLOW_TS);

    await runExport(['my-tour.ts']);

    const [, contents] = writtenFile();
    const parsed = JSON.parse(contents ?? '') as {
      id?: string;
      initial?: string;
      states?: Record<string, unknown>;
    };
    expect(parsed.id).toBe('welcome');
    expect(parsed.initial).toBe('s1');
    expect(parsed.states).toHaveProperty('s1');
  });

  it('exits 1 when no FlowDefinition can be extracted', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('export const notAFlow = 42;\n');

    await expect(runExport(['my-tour.ts'])).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('exportCommand — failure paths', () => {
  it('exits 1 when the input file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);

    await expect(runExport(['missing.json'])).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('exits 1 for an unsupported extension', async () => {
    fs.existsSync.mockReturnValue(true);

    await expect(runExport(['flow.yaml'])).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('defaults the input to my-tour.ts when no file argument is given', async () => {
    fs.existsSync.mockReturnValue(false);

    await expect(runExport([])).rejects.toThrow('process.exit(1)');

    expect(fs.existsSync).toHaveBeenCalledWith(resolve('my-tour.ts'));
  });
});
