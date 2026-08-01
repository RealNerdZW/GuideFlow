import { defineConfig, devices } from '@playwright/test';

/**
 * The fixture page loads the real built artefacts from packages/core/dist, so
 * the server is rooted at the REPO ROOT and the base URL points at the fixture
 * directory. Previously this booted Storybook at :6006 while every spec looked
 * for #start-btn on a page Storybook does not serve — one of three reasons this
 * suite had never executed.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4173);
const BASE = `http://127.0.0.1:${PORT}/apps/e2e/fixtures/`;

/**
 * The extension specs live in their own directory and their own project.
 *
 * They are Chromium-only — `--load-extension` exists nowhere else — and they
 * build their own browser context, so nothing in `use` applies to them. The
 * four browser projects therefore match `./tests` only, and the extension
 * project matches `./tests-extension` only, so neither can silently pick up
 * the other's specs.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // Conditional spread rather than `workers: undefined` — the repo sets
  // exactOptionalPropertyTypes, so an explicit undefined is a type error.
  ...(process.env['CI'] ? { workers: 1 } : {}),

  reporter: process.env['CI']
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', testDir: './tests', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', testDir: './tests', use: { ...devices['Pixel 5'] } },
    {
      // No `use.browserName` and no device: the context fixture calls
      // chromium.launchPersistentContext itself, so project launch options are
      // bypassed entirely. `baseURL` is threaded through by hand inside the
      // fixture — this is the extension-project version of the goto('/') trap.
      name: 'extension',
      testDir: './tests-extension',
      // NOT parallel. Every test here launches its own full Chromium with a
      // fresh profile and an unpacked extension, which is far heavier than a
      // browser context. Running nine at once exhausted the machine and
      // produced "Tearing down context exceeded the test timeout" on all of
      // them — a resource failure that reads exactly like nine product bugs.
      fullyParallel: false,
      // And a longer budget, because profile creation plus extension load is
      // seconds before the first assertion runs.
      timeout: 60_000,
    },
  ],

  webServer: {
    // Build core and the checklist first: the fixture loads dist/index.global.js,
    // dist/styles and packages/checklist/dist, so without this a stale bundle —
    // or an absent one — would silently be under test.
    // The extension's dist/ is the artefact under test, so it is built here
    // for the same reason core is: otherwise a stale — or absent — bundle is
    // silently what the suite exercises.
    command:
      'pnpm --filter @guideflow/core --filter @guideflow/checklist --filter @guideflow/devtools build && node serve.mjs',
    url: BASE,
    reuseExistingServer: !process.env['CI'],
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
