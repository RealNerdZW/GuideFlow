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
      // A ratchet, not an aspiration: 94.36/86.19/97.77/94.36 measured today,
      // so hold just below that and fail on any regression. Raise it as
      // coverage improves; never lower it to make a build pass.
      thresholds: {
        statements: 94,
        lines: 94,
        branches: 85,
        functions: 97,
      },
    },
  },
})
