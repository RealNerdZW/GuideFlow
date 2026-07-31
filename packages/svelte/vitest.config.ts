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
      // A ratchet, not an aspiration: the store, the actions and the barrel are
      // at 100/100/100/100 today, so hold just below that and fail on any
      // regression.
      thresholds: {
        statements: 98,
        lines: 98,
        branches: 98,
        functions: 98,
      },
    },
  },
})
