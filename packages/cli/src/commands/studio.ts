import { resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { createServer } from 'vite';

/**
 * `guideflow studio` — launch a local Vite dev server that loads the user's
 * project and exposes the GuideFlow DevTools panel at http://localhost:4747.
 */
export const studioCommand = new Command('studio')
  .description('Start the GuideFlow Studio — a local visual tour editor')
  .option('-p, --port <port>', 'Port to listen on', '4747')
  .option('--root <dir>', 'Project root directory', '.')
  .action(async (opts: { port: string; root: string }) => {
    const port = parseInt(opts.port, 10);
    const root = resolve(opts.root);

    console.log(chalk.cyan('\n  GuideFlow Studio\n'));
    const spinner = ora('Starting dev server…').start();

    try {
      const server = await createServer({
        root,
        server: { port, open: false },
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
      spinner.succeed(`Studio running at ${chalk.bold(`http://localhost:${port}`)}`);
      console.log(chalk.dim('\n  Press Ctrl+C to stop.\n'));

      process.on('SIGINT', () => {
        void server.close();
        process.exit(0);
      });
    } catch (err) {
      spinner.fail('Failed to start Studio');
      console.error(err);
      process.exit(1);
    }
  });
