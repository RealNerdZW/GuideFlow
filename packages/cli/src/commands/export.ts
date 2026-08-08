import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

import { parseFlowFile, stringifyFlowFile } from '@guideflow/core/authoring';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * `guideflow export [flowFile]` — normalise a flow file into the one on-disk
 * format, validating it on the way through.
 *
 * **The `.ts` / `.js` path is gone.** It regex-matched the source, wrote
 * `{ _note, rawSnippet: match[0].slice(0, 500) }` — a truncated slice of the
 * user's own source, not a flow — printed a green success and exited **0**,
 * leaving a file that looked shippable and was not. Deleting the lie is the
 * fix; a TypeScript parser is a dependency this package should not carry.
 */
export const exportCommand = new Command('export')
  .description('Export a flow definition to JSON')
  .argument('[file]', 'Path to the flow file (.ts, .js, or .json)', 'my-tour.ts')
  .option('-o, --output <file>', 'Output JSON file path')
  .option('--pretty', 'Accepted and ignored — output is always pretty-printed', false)
  .option('--force', 'Overwrite the output file if it already exists', false)
  .action((file: string, opts: { output?: string; pretty: boolean; force: boolean }) => {
    const src = resolve(file);

    if (!existsSync(src)) {
      console.error(chalk.red(`\n  Error: File not found — ${src}\n`));
      process.exit(1);
    }

    const ext = extname(src).toLowerCase();

    if (ext !== '.json') {
      console.error(chalk.red(`\n  Cannot export ${ext || 'that'} — this command reads JSON.`));
      console.error(chalk.dim('  A flow in TypeScript is code; export it from code:\n'));
      console.error(chalk.dim("    import { stringifyFlowFile } from '@guideflow/core/authoring'"));
      console.error(chalk.dim("    import { flow } from './my-tour.js'"));
      console.error(chalk.dim("    writeFileSync('my-tour.flow.json', stringifyFlowFile(flow))\n"));
      process.exit(1);
    }

    // One reader, one writer. The old code JSON.parsed and re-emitted the bytes
    // without ever asking whether they were a flow.
    const parsed = parseFlowFile(readFileSync(src, 'utf-8'));
    for (const issue of parsed.issues) {
      const tag = issue.severity === 'error' ? chalk.red('  error') : chalk.yellow('  warn ');
      console.error(`${tag} ${chalk.dim(issue.path)} ${issue.message}`);
      console.error(chalk.dim(`        → ${issue.hint}`));
    }
    if (!parsed.valid || !parsed.flow) {
      console.error(chalk.red('\n  Refusing to export an invalid flow.\n'));
      process.exit(1);
    }
    const flow = parsed.flow;

    // `src.replace(/\.(ts|js)$/, '.flow.json')` does not match a `.json` input,
    // so `guideflow export flow.json` used to resolve the output to the input
    // and silently overwrite the user's own file — minified, if --pretty was
    // omitted (AUDIT `export-overwrites-json-source-file`). Strip whatever
    // extension is actually there.
    const outPath = opts.output ?? src.replace(/\.[^./\\]+$/, '') + '.flow.json';

    if (resolve(outPath) === src) {
      console.error(
        chalk.red(`\n  Error: refusing to overwrite the input file — ${src}`),
        chalk.dim('\n  Pass -o <file> to choose a different destination.\n'),
      );
      process.exit(1);
    }

    if (existsSync(outPath) && !opts.force) {
      console.error(
        chalk.red(`\n  Error: ${outPath} already exists.`),
        chalk.dim('\n  Pass --force to overwrite it, or -o <file> to write elsewhere.\n'),
      );
      process.exit(1);
    }

    // Always pretty: a flow file lives in a repo and is read in diffs.
    // `--pretty` is kept as an accepted no-op so existing scripts do not break.
    writeFileSync(outPath, stringifyFlowFile(flow, { generator: 'guideflow export' }), 'utf-8');

    console.log(chalk.green(`\n  ✓ Exported flow to ${chalk.bold(outPath)}\n`));
  });
