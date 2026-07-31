import { resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

/**
 * `guideflow studio` — serve the user's project with Vite and flag the page for
 * the DevTools extension.
 *
 * Vite is imported **lazily**, and is an optional peer rather than a hard
 * dependency. It used to be a runtime `dependency` imported at module scope,
 * which meant every `guideflow init` user installed the whole of Vite for a
 * command most of them never run — and it made Vite's transitive advisories
 * (postcss, esbuild) part of this package's production dependency tree. As of
 * this change every production audit finding against @guideflow/cli came from
 * that single import (AUDIT `cli-ships-vite-as-runtime-dependency`).
 *
 * Most projects that would run `studio` already have Vite installed, so for
 * them nothing changes. Everyone else gets a clear instruction instead of a
 * silent 20 MB.
 */

/** Shape of the bit of Vite this command uses. */
interface ViteServer {
  listen(): Promise<unknown>;
  close(): Promise<unknown>;
}
interface ViteModule {
  createServer(config: Record<string, unknown>): Promise<ViteServer>;
}

async function loadVite(): Promise<ViteModule> {
  try {
    return (await import('vite')) as unknown as ViteModule;
  } catch {
    throw new Error(
      'GuideFlow Studio needs Vite, which is an optional dependency.\n' +
        '  Install it in your project:  pnpm add -D vite\n' +
        '  (Most projects that would use Studio already have it.)',
    );
  }
}

export const studioCommand = new Command('studio')
  .description('Start the GuideFlow Studio — a local visual tour editor')
  .option('-p, --port <port>', 'Port to listen on', '4747')
  .option('--root <dir>', 'Project root directory', '.')
  .option('--host <host>', 'Interface to bind to', '127.0.0.1')
  .action(async (opts: { port: string; root: string; host: string }) => {
    const port = parseInt(opts.port, 10);
    const root = resolve(opts.root);

    console.log(chalk.cyan('\n  GuideFlow Studio\n'));
    const spinner = ora('Starting dev server…').start();

    try {
      // Called on the module rather than destructured: `createServer` is a
      // method, and pulling it off the namespace trips no-unbound-method.
      const vite = await loadVite();

      const server = await vite.createServer({
        root,
        server: {
          port,
          open: false,
          // Loopback by default: this serves the user's whole project
          // directory, so it must not be reachable from the network unless
          // they ask for that explicitly.
          host: opts.host,
        },
        plugins: [
          // Inject the GuideFlow DevTools script into every HTML response
          {
            name: 'guideflow-studio',
            transformIndexHtml(html: string) {
              return html.replace(
                '</body>',
                `<script>window.__GUIDEFLOW_DEVTOOLS__ = true;</script></body>`,
              );
            },
          },
        ],
      });

      await server.listen();
      spinner.succeed(`Studio running at ${chalk.bold(`http://${opts.host}:${port}`)}`);
      console.log(chalk.dim('\n  Press Ctrl+C to stop.\n'));

      process.on('SIGINT', () => {
        void server.close();
        process.exit(0);
      });
    } catch (err) {
      spinner.fail('Failed to start Studio');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });
