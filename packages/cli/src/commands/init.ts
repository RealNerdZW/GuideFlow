import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

const FLOW_TEMPLATE = `import { gf } from './guideflow';

gf.start({
  id: 'welcome-tour',
  steps: [
    {
      id: 'step-1',
      title: 'Welcome!',
      body: 'This is your first step.',
      target: '#app',
      placement: 'bottom',
    },
  ],
});
`;

export const initCommand = new Command('init')
  .description('Scaffold a new GuideFlow configuration in your project')
  .option('--dir <directory>', 'Target directory', '.')
  .option('--framework <framework>', 'Framework (react | vue | svelte | none)')
  .action(async (opts: { dir: string; framework?: string }) => {
    console.log(chalk.cyan('\n  GuideFlow — init\n'));

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'Which framework are you using?',
        choices: ['react', 'vue', 'svelte', 'none'],
        default: opts.framework ?? 'react',
        when: !opts.framework,
      },
      {
        type: 'input',
        name: 'outputDir',
        message: 'Where should GuideFlow files be placed?',
        default: opts.dir,
      },
    ]);

    const framework: string = opts.framework ?? answers.framework;
    const outputDir: string = answers.outputDir;

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(join(outputDir, 'guideflow.ts'), CORE_TEMPLATE, 'utf-8');
    writeFileSync(join(outputDir, 'my-tour.ts'), FLOW_TEMPLATE, 'utf-8');

    if (framework === 'react') {
      writeFileSync(join(outputDir, 'GuideFlowProvider.tsx'), REACT_TEMPLATE, 'utf-8');
    }

    console.log(chalk.green('\n  ✓ GuideFlow initialized!\n'));
    console.log(`  Files written to ${chalk.bold(outputDir)}:`);
    console.log(`    ${chalk.dim('guideflow.ts')}  — configuration & singleton`);
    console.log(`    ${chalk.dim('my-tour.ts')}   — example tour flow`);
    if (framework === 'react') {
      console.log(`    ${chalk.dim('GuideFlowProvider.tsx')}  — React provider wrapper`);
    }

    console.log('\n  Next steps:');
    const pkgName = framework === 'none' ? 'core' : framework;
    console.log(`    ${chalk.cyan(`pnpm add @guideflow/core @guideflow/${pkgName}`)}`);
    console.log(`    Customize ${chalk.bold('guideflow.ts')} and ${chalk.bold('my-tour.ts')}\n`);
  });
