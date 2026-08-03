import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    // node, not happy-dom: this server never touches a DOM, and running it in
    // one would hide an accidental `document` reference.
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__', 'src/index.ts', 'src/version.ts'],
      thresholds: { statements: 90, lines: 90, branches: 85, functions: 90 },
    },
  },
})
