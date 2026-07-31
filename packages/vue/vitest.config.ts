import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__'],
      // A ratchet, not an aspiration: set just below what the suite achieves
      // today (100/100/100/100) so a regression fails CI. The whole adapter —
      // barrel, plugin, useTour and useHotspot — is exercised against a real
      // createGuideFlow() instance, not a mock.
      thresholds: {
        statements: 98,
        lines: 98,
        branches: 98,
        functions: 98,
      },
    },
  },
})
