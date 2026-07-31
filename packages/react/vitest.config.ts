import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/__tests__'],
      // A ratchet set just below what the suite actually achieves (98.91 / 91.76
      // / 91.80 / 98.91 at the time of writing). Raised from 35% in Phase 5.1,
      // where every component gained tests against a real createGuideFlow()
      // instance rather than a hand-written mock.
      thresholds: {
        statements: 98,
        lines: 98,
        branches: 90,
        functions: 90,
      },
    },
  },
});
