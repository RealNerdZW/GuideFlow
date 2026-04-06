import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/GuideFlow/demo/',
  plugins: [react()],
  resolve: {
    // Point workspace packages directly at their TypeScript source so the
    // demo always reflects the latest changes without a rebuild step.
    alias: {
      '@guideflow/core':      path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@guideflow/react':     path.resolve(__dirname, '../../packages/react/src/index.ts'),
      '@guideflow/ai':        path.resolve(__dirname, '../../packages/ai/src/index.ts'),
      '@guideflow/analytics': path.resolve(__dirname, '../../packages/analytics/src/index.ts'),
    },
  },
})
