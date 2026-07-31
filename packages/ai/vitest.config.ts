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
      // Ratchet at just below current. All three real providers are now covered;
      // the gap is index.ts/createAI and parts of dom-context.
      thresholds: {
        statements: 83,
        lines: 83,
        branches: 75,
        functions: 88,
      },
    },
  },
});
