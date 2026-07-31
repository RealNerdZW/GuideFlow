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
      // Deliberately low. Only the hooks and the provider are covered; all four
      // components (GuidePopover, TourStep, HotspotBeacon, ConversationalPanel)
      // have none. This is a ratchet against further regression, not the target
      // — REMEDIATION-PLAN Phase 5.1 rewrites those components and raises this
      // to the 75% target in TESTING-STRATEGY.md.
      thresholds: {
        statements: 35,
        lines: 35,
        branches: 78,
        functions: 45,
      },
    },
  },
});
