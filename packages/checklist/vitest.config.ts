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
      // A ratchet, not an aspiration: 98.42/89.47/98.24/98.42 measured today,
      // so hold just below that and fail on any regression. Raise it as
      // coverage improves; never lower it to make a build pass.
      thresholds: {
        statements: 97,
        lines: 97,
        branches: 88,
        functions: 97,
      },
    },
  },
})
