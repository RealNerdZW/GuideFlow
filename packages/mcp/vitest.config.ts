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
      // Ratchets, set just below measured (97.63 / 87.79 / 100 / 97.63 after
      // the catalogue tools landed and their three defects were fixed). Raise
      // them as coverage improves; never lower one to make a build pass.
      thresholds: { statements: 97, lines: 97, branches: 87, functions: 95 },
    },
  },
})
