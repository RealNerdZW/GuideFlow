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
      // Ratchet at just below current. All seven transports plus the collector,
      // ExperimentEngine, PrivacyPolicy, computeFunnel and the package entry
      // are covered.
      thresholds: {
        // Ratchets, set just below measured (100 / 100 / 99.02 / 100).
        // Raise them as coverage improves; never lower them to make a build
        // pass. computeFunnel's incomplete-payload fallbacks, the webhook retry
        // budget and the DNT spellings pushed these up, not down; the GA4 and
        // Heap transports landed at 100% on every metric, which is what took
        // branches from 98.68 to 98.93 — and then to 99.02, when hardening
        // Heap's global lookup and its realm-safe Date/Map/Set checks added
        // branches that are all covered.
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
        branches: 99,
        functions: 99,
      },
    },
  },
});
