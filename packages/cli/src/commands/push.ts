import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PushOptions {
  endpoint: string;
  apiKey?: string;
  env?: string;
}

/**
 * `guideflow push [file]` — publish a flow JSON file to a GuideFlow Cloud
 * endpoint (or a self-hosted API).
 *
 * The target URL defaults to the official GuideFlow Cloud API but can be
 * overridden with `--endpoint` for self-hosted setups.
 */
export const pushCommand = new Command('push')
  .description('Push a flow JSON file to GuideFlow Cloud or a custom endpoint')
  .argument('[file]', 'Path to the flow JSON file', 'my-tour.flow.json')
  .requiredOption('-k, --api-key <key>', 'API key (or set GUIDEFLOW_API_KEY env var)')
  .option('-e, --endpoint <url>', 'API endpoint', 'https://api.guideflow.dev/v1/flows')
  .option('--env <env>', 'Deployment environment (production | staging | preview)', 'production')
  .action(async (file: string, opts: PushOptions & { apiKey: string }) => {
    const src = resolve(file);

    if (!existsSync(src)) {
      console.error(chalk.red(`\n  Error: File not found — ${src}\n`));
      process.exit(1);
    }

    const apiKey: string = opts.apiKey || process.env['GUIDEFLOW_API_KEY'] || '';
    if (!apiKey) {
      console.error(chalk.red('\n  Error: API key is required. Pass --api-key or set GUIDEFLOW_API_KEY.\n'));
      process.exit(1);
    }

    const body = readFileSync(src, 'utf-8');
    let flow: { id?: string };
    try {
      flow = JSON.parse(body) as { id?: string };
    } catch {
      console.error(chalk.red('\n  Error: Invalid JSON in flow file.\n'));
      process.exit(1);
    }

    const spinner = ora(`Pushing flow ${chalk.bold(flow.id ?? 'unknown')} to ${opts.endpoint}…`).start();

    try {
      const res = await fetch(opts.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-GuideFlow-Env': opts.env ?? 'production',
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        spinner.fail(`Push failed: ${res.status} ${text}`);
        process.exit(1);
      }

      const data = (await res.json()) as { id?: string; url?: string };
      spinner.succeed(`Flow published!`);
      if (data.url) console.log(`  ${chalk.dim('View:')} ${chalk.cyan(data.url)}`);
      console.log();
    } catch (err) {
      spinner.fail('Network error while pushing flow');
      console.error(err);
      process.exit(1);
    }
  });
