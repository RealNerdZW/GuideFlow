import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // Ratchet at just below current. All five transports plus the collector and
      // ExperimentEngine are covered.
      thresholds: {
        // Ratchets, set just below measured (90.56 / 90.07 / 94.44 / 90.56).
        // Raise them as coverage improves; never lower them to make a build
        // pass. startVariant and track() pushed these up, not down.
        statements: 90,
        lines: 90,
        branches: 89,
        functions: 94,
      },
    },
  },
});
