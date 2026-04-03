/**
 * @guideflow/cli
 *
 * @author  John Mugabe
 * @email   jonesmugabe@263tickets.co.zw
 * @country Zimbabwe
 * @github  https://github.com/johnmugabe
 * @license MIT
 *
 * Copyright (c) 2026 John Mugabe. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root.
 *
 * Command-line interface for GuideFlow.js
 *
 * Commands:
 *   guideflow init    — scaffold GuideFlow configuration in a project
 *   guideflow studio  — launch the local visual tour editor
 *   guideflow export  — export a flow definition to JSON
 *   guideflow push    — publish a flow to GuideFlow Cloud or self-hosted API
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

import { initCommand } from './commands/init.js';
import { studioCommand } from './commands/studio.js';
import { exportCommand } from './commands/export.js';
import { pushCommand } from './commands/push.js';

// Resolve package version at runtime without import assertions (ESM-safe)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };

const program = new Command()
  .name('guideflow')
  .description('GuideFlow.js — AI-powered product tours')
  .version(pkg.version, '-v, --version', 'Print the version number');

program.addCommand(initCommand);
program.addCommand(studioCommand);
program.addCommand(exportCommand);
program.addCommand(pushCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
