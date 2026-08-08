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
      // A ratchet set just below what the suite actually achieves (100 / 97.04
      // / 100 / 100 at the time of writing). Raised from 35% in Phase 5.1,
      // where every component gained tests against a real createGuideFlow()
      // instance rather than a hand-written mock, and again once <GuidePopover>
      // gained tests for ADR-024's widened focus trap and ADR-025's conditional
      // focus. What is left uncovered is the SSR half of five `typeof document`
      // guards, three defensive null-ref checks, and one StrictMode guard that
      // the current code cannot reach — see the note in internal.test.tsx.
      thresholds: {
        statements: 99,
        lines: 99,
        branches: 96,
        functions: 99,
      },
    },
  },
});
