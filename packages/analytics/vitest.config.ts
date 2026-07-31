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
        statements: 86,
        lines: 86,
        branches: 85,
        functions: 90,
      },
    },
  },
});
