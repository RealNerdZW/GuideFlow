import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // The store is fully covered today; hold it there.
      thresholds: {
        statements: 95,
        lines: 95,
        branches: 95,
        functions: 95,
      },
    },
  },
})
