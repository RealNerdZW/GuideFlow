import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseFlowFile, type FlowIssue } from '@guideflow/core/authoring';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * `guideflow validate <files...>` — check flow files before they ship.
 *
 * Runtime validation inside the engine is exactly one check
 * (`flow.initial in flow.states`), so every other way of getting a flow wrong
 * fails at the user rather than at the author. The worst of them fails *as
 * success*: a transition naming a state that does not exist emits one
 * `console.warn`, then `tour:complete`, which marks the flow completed so it
 * never shows again. That is what this command exists to catch.
 *
 * Exit codes are the contract, because the point is to run this in CI:
 *   0 — no errors (warnings may have been printed)
 *   1 — at least one error, or a file that could not be read
 */
export const validateCommand = new Command('validate')
  .description('Validate flow files (.flow.json) and report problems')
  .argument('<files...>', 'Flow files to check')
  .option('--strict', 'Treat warnings as errors', false)
  .action((files: string[], opts: { strict: boolean }) => {
    let errorCount = 0;
    let warningCount = 0;
    let checked = 0;

    for (const file of files) {
      const path = resolve(file);
      if (!existsSync(path) || !statSync(path).isFile()) {
        console.error(chalk.red(`\n  ✗ ${file}`), chalk.dim('— not found'));
        errorCount++;
        continue;
      }

      const result = parseFlowFile(readFileSync(path, 'utf-8'));
      checked++;
      errorCount += result.errors.length;
      warningCount += result.warnings.length;

      if (result.issues.length === 0) {
        console.log(chalk.green(`\n  ✓ ${file}`), chalk.dim(`— ${describe(result.flow)}`));
        continue;
      }

      const bad = result.errors.length > 0;
      console.log(
        bad ? chalk.red(`\n  ✗ ${file}`) : chalk.yellow(`\n  ⚠ ${file}`),
        chalk.dim(
          `— ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
        ),
      );
      for (const issue of result.issues) print(issue);
    }

    const failed = errorCount > 0 || (opts.strict && warningCount > 0);
    console.log(
      failed
        ? chalk.red(`\n  ${errorCount} error(s), ${warningCount} warning(s) across ${checked} file(s)\n`)
        : chalk.green(`\n  ${checked} file(s) valid, ${warningCount} warning(s)\n`),
    );
    if (failed) process.exit(1);
  });

/** One issue, with the fix on its own line — the hint is the deliverable. */
function print(issue: FlowIssue): void {
  const tag =
    issue.severity === 'error' ? chalk.red('error') : chalk.yellow('warn ');
  const where = issue.path ? chalk.dim(` ${issue.path}`) : '';
  console.log(`    ${tag}${where}`);
  console.log(`      ${issue.message}`);
  console.log(chalk.dim(`      → ${issue.hint}`));
}

function describe(flow: { id?: string; states?: Record<string, unknown> } | null): string {
  if (!flow) return 'no flow';
  const states = Object.keys(flow.states ?? {}).length;
  return `${String(flow.id)}, ${states} state(s)`;
}
