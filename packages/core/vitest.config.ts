import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/styles', 'src/__tests__'],
      // A ratchet, not an aspiration: set just below what the suite actually
      // achieves today so a regression fails CI, and raised as coverage
      // improves. The 90% target for core in TESTING-STRATEGY.md is already met
      // for statements and lines.
      thresholds: {
        statements: 90,
        lines: 90,
        branches: 78,
        functions: 78,
      },
    },
  },
})
