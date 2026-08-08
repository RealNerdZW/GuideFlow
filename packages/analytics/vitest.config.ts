import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // Ratchet at just below current. All five transports plus the collector,
      // ExperimentEngine, PrivacyPolicy, computeFunnel and the package entry
      // are covered.
      thresholds: {
        // Ratchets, set just below measured (100 / 100 / 98.68 / 100).
        // Raise them as coverage improves; never lower them to make a build
        // pass. computeFunnel's incomplete-payload fallbacks, the webhook retry
        // budget and the DNT spellings pushed these up, not down.
        //
        // Branches stop short of 100 for three deliberately unreachable guards:
        // `funnel.ts:235`/`:242` (a step id only enters `order` at the moment
        // its `reached` counter is created, so neither `?? 0` nor the
        // divide-by-zero arm can fire) and `start-variant.ts:86` (`gf.flowId`
        // is non-null whenever `gf.isActive` is, which line 79 has just
        // established). Reaching them needs a fake instance, which would assert
        // the fake rather than the engine.
        statements: 99,
        lines: 99,
        branches: 98,
        functions: 99,
      },
    },
  },
});
