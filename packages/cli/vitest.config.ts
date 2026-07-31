import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // This package is a Node CLI — no DOM, no happy-dom.
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // Ratchet at just below current. All four commands are covered; the
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
