import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

/**
 * `guideflow export [flowFile]` — read a TypeScript/JSON flow definition and
 * write it out as a portable JSON file suitable for:
 *   - GuideFlow Cloud
 *   - The DevTools browser extension import
 *   - Other tooling that consumes the FlowDefinition schema
 *
 * For `.ts` / `.js` files a best-effort static extraction is performed.  For
 * complex dynamic flows the user should use the programmatic API instead.
 */
export const exportCommand = new Command('export')
  .description('Export a flow definition to JSON')
  .argument('[file]', 'Path to the flow file (.ts, .js, or .json)', 'my-tour.ts')
  .option('-o, --output <file>', 'Output JSON file path')
  .option('--pretty', 'Pretty-print output JSON', false)
  .option('--force', 'Overwrite the output file if it already exists', false)
  .action((file: string, opts: { output?: string; pretty: boolean; force: boolean }) => {
    const src = resolve(file);

    if (!existsSync(src)) {
      console.error(chalk.red(`\n  Error: File not found — ${src}\n`));
      process.exit(1);
    }

    const ext = extname(src).toLowerCase();
    let flowJson: unknown;

    if (ext === '.json') {
      const raw = readFileSync(src, 'utf-8');
      flowJson = JSON.parse(raw) as unknown;
    } else if (ext === '.ts' || ext === '.js') {
      // Static extraction: look for an object literal with 'id' and 'states' (FlowDefinition shape)
      const raw = readFileSync(src, 'utf-8');
      const match = raw.match(/\{[\s\S]*?id\s*:\s*['"]([^'"]+)['"][\s\S]*?states\s*:\s*\{/);
      if (!match) {
        console.error(chalk.red('\n  Could not statically extract a FlowDefinition from the file.'));
        console.error(chalk.dim('  Tip: ensure the file exports a FlowDefinition object with { id, initial, states }.'));
        console.error(chalk.dim('  For complex flows, write the definition to a JSON file directly.\n'));
        process.exit(1);
      }
      // For now emit a helpful stub and warn
      flowJson = {
        _note: 'Static extraction was used. Review and complete this file.',
        rawSnippet: match[0].slice(0, 500),
      };
      console.warn(
        chalk.yellow('\n  ⚠  TypeScript static extraction is limited. Please verify the output.\n'),
      );
    } else {
      console.error(chalk.red(`\n  Unsupported file type: ${ext}\n`));
      process.exit(1);
    }

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

    const json = opts.pretty ? JSON.stringify(flowJson, null, 2) : JSON.stringify(flowJson);
    writeFileSync(outPath, json, 'utf-8');

    console.log(chalk.green(`\n  ✓ Exported flow to ${chalk.bold(outPath)}\n`));
  });
