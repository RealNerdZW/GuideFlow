import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // The bridge runs in the page world and touches DOM types.
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      /**
       * Only the modules a unit test can honestly own.
       *
       * The service worker, the content script, the page-world bridge, the
       * panel, the popup and the Recorder's React tree all need `chrome.*`
       * across four processes and a real browser. Mocking that surface well
       * enough to produce a coverage number would test the mock, not the
       * extension — and this repo has been burned by exactly that.
       *
       * They are not untested. `apps/e2e/tests-extension/` drives the BUILT
       * extension in real Chromium: the worker registers, the content script
       * injects, detection reaches the badge, recording survives a navigation
       * and an absent UI, the packaged zip loads, and the Recorder validates
       * and refuses a broken draft. That suite is the coverage for everything
       * excluded here. Widening this list without widening the tests would
       * produce a lower number and no more safety.
       */
      include: [
        'src/cloneable.ts',
        'src/messages.ts',
        'src/recorder/session.ts',
        'src/recorder/steps.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // A ratchet, set just below measured. Raise it as coverage improves;
      // never lower it to make a build pass.
      // Raised with `steps.ts`, which arrived fully covered: 99 / 91.17 / 100
      // / 99 before, 99.3 / 93.61 / 100 / 99.3 after.
      thresholds: {
        statements: 99,
        lines: 99,
        branches: 93,
        functions: 95,
      },
    },
  },
});
