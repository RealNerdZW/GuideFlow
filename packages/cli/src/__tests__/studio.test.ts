/**
 * `guideflow studio` — unit tests.
 *
 * `vite` is mocked, so no test ever binds a port. `ora` is mocked to keep the
 * spinner off the test output. Both are hoisted so the same instances survive
 * the `vi.resetModules()` that gives each run a pristine Command instance.
 */
import { resolve } from 'node:path';

import type { Command } from 'commander';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The subset of the Vite config that studio.ts builds. */
interface StudioConfig {
  root: string;
  server: { port: number; open: boolean };
  plugins: Array<{ name: string; transformIndexHtml: (html: string) => string }>;
}

const vite = vi.hoisted(() => ({
  createServer: vi.fn<[StudioConfig], Promise<{ listen: () => Promise<void>; close: () => void }>>(),
}));

const spinner = vi.hoisted(() => ({
  succeed: vi.fn<[string?], void>(),
  fail: vi.fn<[string?], void>(),
  stop: vi.fn<[], void>(),
}));

vi.mock('vite', () => vite);
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

let exitSpy: MockInstance<Parameters<typeof process.exit>, ReturnType<typeof process.exit>>;
let sigintBefore: readonly unknown[];

async function runStudio(args: string[]): Promise<void> {
  vi.resetModules();
  const mod: { studioCommand: Command } = await import('../commands/studio.js');
  await mod.studioCommand.parseAsync(args, { from: 'user' });
}

/** The config studio.ts handed to Vite. */
function viteConfig(): StudioConfig | undefined {
  return vite.createServer.mock.calls[0]?.[0];
}

beforeEach(() => {
  vite.createServer.mockReset();
  vite.createServer.mockResolvedValue({
    listen: () => Promise.resolve(),
    close: () => undefined,
  });
  spinner.succeed.mockReset();
  spinner.fail.mockReset();

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExited(typeof code === 'number' ? code : 0);
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  // The success path installs a SIGINT handler; drop the ones we add so they do
  // not pile up on the test runner's own process.
  sigintBefore = process.listeners('SIGINT');
});

afterEach(() => {
  for (const listener of process.listeners('SIGINT')) {
    if (!sigintBefore.includes(listener)) process.off('SIGINT', listener);
  }
  vi.restoreAllMocks();
});

describe('studioCommand', () => {
  it('serves the cwd on port 4747 by default, without opening a browser', async () => {
    await runStudio([]);

    expect(vite.createServer).toHaveBeenCalledTimes(1);
    expect(viteConfig()?.root).toBe(resolve('.'));
    // Loopback by default: this serves the user's entire project directory, so
    // it must not be reachable from the network unless they ask for that.
    expect(viteConfig()?.server).toEqual({ port: 4747, open: false, host: '127.0.0.1' });
    expect(spinner.succeed).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('binds elsewhere only when --host is given explicitly', async () => {
    await runStudio(['--host', '0.0.0.0']);

    expect(viteConfig()?.server).toEqual({ port: 4747, open: false, host: '0.0.0.0' });
  });

  it('honours --port and --root', async () => {
    await runStudio(['--port', '5000', '--root', './demo']);

    expect(viteConfig()?.root).toBe(resolve('./demo'));
    expect(viteConfig()?.server.port).toBe(5000);
  });

  /*
   * RECORDED, NOT ENDORSED. The plugin injects `window.__GUIDEFLOW_DEVTOOLS__`,
   * but nothing anywhere reads that global: the devtools extension's bridge
   * probes `window.__guideflow` (packages/devtools/src/bridge.ts), which the
   * library never sets either. So the flag is inert, and studio is effectively
   * `vite dev` with an extra script tag — not the "visual tour editor" its
   * description promises. This test pins the current injection, not its worth.
   */
  it('injects the devtools flag before </body>', async () => {
    await runStudio([]);

    const plugin = viteConfig()?.plugins[0];
    expect(plugin?.name).toBe('guideflow-studio');

    const html = plugin?.transformIndexHtml('<html><body><div id="app"></div></body></html>');
    expect(html).toContain('window.__GUIDEFLOW_DEVTOOLS__ = true;');
    expect(html).toContain('</script></body>');
  });

  it('leaves HTML without a </body> untouched', async () => {
    await runStudio([]);

    const plugin = viteConfig()?.plugins[0];
    expect(plugin?.transformIndexHtml('<div id="app"></div>')).toBe('<div id="app"></div>');
  });

  it('exits 1 when the dev server fails to start', async () => {
    vite.createServer.mockRejectedValue(new Error('EADDRINUSE'));

    await expect(runStudio([])).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(spinner.fail).toHaveBeenCalledWith('Failed to start Studio');
    expect(console.error).toHaveBeenCalled();
  });
});
