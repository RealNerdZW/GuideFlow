import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // This package is a Node CLI — no DOM, no happy-dom.
    environment: 'node',
    /**
     * Longer than the 5 s default, deliberately.
     *
     * Every spec here calls `vi.resetModules()` and re-imports the command
     * under test, and since `validate`/`export` started importing
     * `@guideflow/core/authoring` that graph is much larger. Under a
     * fully-parallel `turbo run` across nine packages a single test
     * intermittently exceeded 5 s — which reports as a product failure and
     * passes on every rerun, the least useful kind of red.
     */
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // Ratchet at just below current. Every command is covered; the
      // remaining gap is error branches that call process.exit.
      thresholds: {
        statements: 95,
        lines: 95,
        branches: 78,
        functions: 85,
      },
    },
  },
});
