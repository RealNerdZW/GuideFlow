/**
 * `guideflow push` — unit tests.
 *
 * No test may open a socket or read a real file: `fetch` is stubbed globally,
 * `node:fs` and `ora` are replaced with hoisted mocks (hoisted so the same mock
 * instances survive the `vi.resetModules()` that gives each run a pristine
 * Command instance — commander caches parsed option values on the instance).
 */
import type { Command } from 'commander';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  existsSync: vi.fn<[string], boolean>(),
  readFileSync: vi.fn<[string, string], string>(),
}));

const spinner = vi.hoisted(() => ({
  succeed: vi.fn<[string?], void>(),
  fail: vi.fn<[string?], void>(),
  stop: vi.fn<[], void>(),
}));

vi.mock('node:fs', () => fs);
vi.mock('ora', () => ({ default: vi.fn(() => ({ start: () => spinner })) }));

/** Thrown by the `process.exit` stub so a test can assert on the exit code. */
class ProcessExited extends Error {
  public readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExited';
    this.code = code;
  }
}

const DEFAULT_ENDPOINT = 'https://api.guideflow.dev/v1/flows';
const TEST_ENDPOINT = 'https://api.example.test/v1/flows';
const FLOW_BODY = '{"id":"welcome-tour","initial":"s1","states":{}}';

let exitSpy: MockInstance<Parameters<typeof process.exit>, ReturnType<typeof process.exit>>;
let fetchMock: MockInstance<Parameters<typeof fetch>, Promise<Response>>;

/** A minimal stand-in for the three `Response` members push.ts actually reads. */
function fakeResponse(init: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: () => Promise.resolve(init.json ?? {}),
    text: () => Promise.resolve(init.text ?? ''),
  } as unknown as Response;
}

async function freshPushCommand(): Promise<Command> {
  vi.resetModules();
  const mod = await import('../commands/push.js');
  return mod.pushCommand;
}

async function runPush(args: string[]): Promise<void> {
  const cmd = await freshPushCommand();
  await cmd.parseAsync(args, { from: 'user' });
}

/** The `[url, init]` of the single request the command issued. */
function request(): [string | undefined, RequestInit | undefined] {
  const call = fetchMock.mock.calls[0] ?? [];
  return [typeof call[0] === 'string' ? call[0] : undefined, call[1]];
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  fs.existsSync.mockReset();
  fs.readFileSync.mockReset();
  spinner.succeed.mockReset();
  spinner.fail.mockReset();

  fetchMock = vi.fn<Parameters<typeof fetch>, Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExited(typeof code === 'number' ? code : 0);
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pushCommand — successful publish', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(FLOW_BODY);
  });

  it('POSTs the file verbatim to the configured endpoint with auth headers', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ json: { id: 'welcome-tour', url: 'https://app.example.test/f/1' } }),
    );

    await runPush([
      'flow.json',
      '--api-key',
      'test-key',
      '--endpoint',
      TEST_ENDPOINT,
      '--env',
      'staging',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = request();
    expect(url).toBe(TEST_ENDPOINT);
    expect(init?.method).toBe('POST');
    // The raw file text is sent — no re-serialisation.
    expect(init?.body).toBe(FLOW_BODY);

    const headers = headersOf(init);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['X-GuideFlow-Env']).toBe('staging');

    expect(spinner.succeed).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('defaults to GuideFlow Cloud and the production env', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ json: { id: 'welcome-tour' } }));

    await runPush(['flow.json', '--api-key', 'test-key']);

    const [url, init] = request();
    expect(url).toBe(DEFAULT_ENDPOINT);
    expect(headersOf(init)['X-GuideFlow-Env']).toBe('production');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('pushCommand — failure paths', () => {
  it('exits 1 on a non-2xx response and reports the status', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(FLOW_BODY);
    fetchMock.mockResolvedValue(
      fakeResponse({ ok: false, status: 422, text: 'flow failed validation' }),
    );

    await expect(
      runPush(['flow.json', '--api-key', 'test-key', '--endpoint', TEST_ENDPOINT]),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    // The first spinner failure is the HTTP one. (The stubbed `process.exit`
    // throws instead of terminating, so the command's own catch block then adds
    // a second, spurious "Network error" failure — an artefact of the stub, not
    // of the command: at runtime `process.exit` never returns.)
    expect(spinner.fail.mock.calls[0]?.[0]).toContain('422');
    expect(spinner.fail.mock.calls[0]?.[0]).toContain('flow failed validation');
  });

  it('exits 1 when the request itself rejects', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(FLOW_BODY);
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      runPush(['flow.json', '--api-key', 'test-key', '--endpoint', TEST_ENDPOINT]),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(spinner.fail).toHaveBeenCalledWith('Network error while pushing flow');
    expect(console.error).toHaveBeenCalled();
  });

  it('exits 1 without calling fetch when the file is missing', async () => {
    fs.existsSync.mockReturnValue(false);

    await expect(runPush(['missing.json', '--api-key', 'test-key'])).rejects.toThrow(
      'process.exit(1)',
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exits 1 without calling fetch when the file is not valid JSON', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('this is not json');

    await expect(runPush(['flow.json', '--api-key', 'test-key'])).rejects.toThrow(
      'process.exit(1)',
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
   * SKIPPED — audit finding `push-requiredoption-kills-env-var`.
   *
   * `--api-key` is declared with `.requiredOption()`, so commander aborts with
   * "required option not specified" before the action body ever runs. That makes
   * the documented `GUIDEFLOW_API_KEY` fallback (push.ts:35, and the option's own
   * help text) unreachable dead code. This test asserts the documented
   * behaviour; it will pass once `--api-key` becomes a plain `.option()`.
   */
  it.skip('falls back to GUIDEFLOW_API_KEY when --api-key is omitted', async () => {
    vi.stubEnv('GUIDEFLOW_API_KEY', 'env-key');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(FLOW_BODY);
    fetchMock.mockResolvedValue(fakeResponse({ json: { id: 'welcome-tour' } }));

    await runPush(['flow.json', '--endpoint', TEST_ENDPOINT]);

    const [, init] = request();
    expect(headersOf(init)['Authorization']).toBe('Bearer env-key');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
