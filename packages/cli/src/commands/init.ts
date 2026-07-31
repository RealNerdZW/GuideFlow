import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';

const CORE_TEMPLATE = `import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles';

export const gf = createGuideFlow({
  // Add your global configuration here
});
`;

const REACT_TEMPLATE = `import React from 'react';
import { TourProvider } from '@guideflow/react';
import { gf } from './guideflow';

export function App({ children }: { children: React.ReactNode }) {
  return <TourProvider instance={gf}>{children}</TourProvider>;
}
`;

const VUE_TEMPLATE = `import type { App } from 'vue';
import { GuideFlowPlugin } from '@guideflow/vue';

import { gf } from './guideflow';

// Register in main.ts:  app.use(installGuideFlow)
export function installGuideFlow(app: App): void {
  app.use(GuideFlowPlugin, { instance: gf });
}
`;

const SVELTE_TEMPLATE = `import { createTourStore } from '@guideflow/svelte';

import { gf } from './guideflow';

// Import this store in a component:
//   import { tour } from './guideflow-store'
//   $: active = $isActive
export const tour = createTourStore(gf);
export const { isActive, currentStepId, currentStepIndex, totalSteps } = tour;
`;

const FLOW_TEMPLATE = `import { gf } from './guideflow';
import type { FlowDefinition } from '@guideflow/core';

// FlowDefinition uses a finite-state machine shape.
// Each key in 'states' is a state node that can hold one or more steps.
const welcomeTour: FlowDefinition = {
  id: 'welcome-tour',
  initial: 'step-1',
  states: {
    'step-1': {
      steps: [
        {
          id: 'step-1',
          content: { title: 'Welcome!', body: 'This is your first step.' },
          target: '#app',
          placement: 'bottom',
        },
      ],
      on: { NEXT: 'step-2' },
    },
    'step-2': {
      steps: [
        {
          id: 'step-2',
          content: { title: 'Next up', body: 'Here is another feature to explore.' },
          target: '#feature',
          placement: 'right',
        },
      ],
      on: {},
      final: true,
    },
  },
};

// Launch the tour
void gf.start(welcomeTour);
`;

export const initCommand = new Command('init')
  .description('Scaffold a new GuideFlow configuration in your project')
  .option('--dir <directory>', 'Target directory', '.')
  .option('--framework <framework>', 'Framework (react | vue | svelte | none)')
  .option('-y, --yes', 'Accept defaults and never prompt (for CI and scripts)', false)
  .option('--force', 'Overwrite files that already exist', false)
  .action(async (opts: { dir: string; framework?: string; yes: boolean; force: boolean }) => {
    console.log(chalk.cyan('\n  GuideFlow — init\n'));

    // The outputDir question had no `when:`, so init always prompted — it could
    // never run unattended even with every flag supplied
    // (AUDIT `init-always-prompts-breaks-ci`). It is now skipped whenever the
    // answer is already known, and `--yes` suppresses prompting entirely.
    const nonInteractive = opts.yes || !process.stdout.isTTY;

    const answers = await inquirer.prompt<{ framework?: string; outputDir?: string }>([
      {
        type: 'list',
        name: 'framework',
        message: 'Which framework are you using?',
        choices: ['react', 'vue', 'svelte', 'none'],
        default: opts.framework ?? 'react',
        when: !opts.framework && !nonInteractive,
      },
      {
        type: 'input',
        name: 'outputDir',
        message: 'Where should GuideFlow files be placed?',
        default: opts.dir,
        when: !nonInteractive,
      },
    ]);

    const framework: string = opts.framework ?? answers.framework ?? 'react';
    const outputDir: string = answers.outputDir ?? opts.dir;

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Every write used to be unconditional, so a second `init` silently
    // destroyed whatever the user had written in these files
    // (AUDIT `init-clobbers-existing-files`).
    const written: string[] = [];
    const skipped: string[] = [];

    const write = (name: string, contents: string): void => {
      const path = join(outputDir, name);
      if (existsSync(path) && !opts.force) {
        skipped.push(name);
        return;
      }
      writeFileSync(path, contents, 'utf-8');
      written.push(name);
    };

    write('guideflow.ts', CORE_TEMPLATE);
    write('my-tour.ts', FLOW_TEMPLATE);

    // `--framework vue` and `--framework svelte` previously wrote no framework
    // file at all and still reported success
    // (AUDIT `init-vue-svelte-scaffold-nothing`).
    const FRAMEWORK_FILES: Record<string, [string, string] | undefined> = {
      react: ['GuideFlowProvider.tsx', REACT_TEMPLATE],
      vue: ['guideflow-plugin.ts', VUE_TEMPLATE],
      svelte: ['guideflow-store.ts', SVELTE_TEMPLATE],
    };
    const frameworkFile = FRAMEWORK_FILES[framework];
    if (frameworkFile) write(frameworkFile[0], frameworkFile[1]);

    if (written.length === 0) {
      console.log(chalk.yellow('\n  Nothing written — every file already exists.'));
      console.log(chalk.dim('  Pass --force to overwrite them.\n'));
      return;
    }

    console.log(chalk.green('\n  ✓ GuideFlow initialized!\n'));
    console.log(`  Files written to ${chalk.bold(outputDir)}:`);
    for (const name of written) console.log(`    ${chalk.dim(name)}`);
    if (skipped.length > 0) {
      console.log(chalk.yellow(`\n  Left alone (already existed): ${skipped.join(', ')}`));
      console.log(chalk.dim('  Pass --force to overwrite them.'));
    }

    console.log('\n  Next steps:');
    const pkgName = framework === 'none' ? 'core' : framework;
    console.log(`    ${chalk.cyan(`pnpm add @guideflow/core @guideflow/${pkgName}`)}`);
    console.log(`    Customize ${chalk.bold('guideflow.ts')} and ${chalk.bold('my-tour.ts')}\n`);
  });
