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

export default defineConfig({
  testDir: './tests',
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],

  webServer: {
    // Build core and the checklist first: the fixture loads dist/index.global.js,
    // dist/styles and packages/checklist/dist, so without this a stale bundle —
    // or an absent one — would silently be under test.
    command:
      'pnpm --filter @guideflow/core --filter @guideflow/checklist build && node serve.mjs',
    url: BASE,
    reuseExistingServer: !process.env['CI'],
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
