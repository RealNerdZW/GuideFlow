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
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
    },
  },
});
