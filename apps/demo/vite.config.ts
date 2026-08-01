import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/GuideFlow/demo/',
  plugins: [react()],
  resolve: {
    // Point workspace packages directly at their TypeScript source so the
    // demo always reflects the latest changes without a rebuild step.
    //
    // Order matters, and so does the regex form. A bare string alias is a
    // PREFIX match, so `'@guideflow/core'` rewrote `@guideflow/core/selector`
    // to `…/src/index.ts/selector` and the build died on a path that is a file
    // with a segment after it. Subpaths are matched first and mapped to their
    // own source file; the exact-match entries come after.
    alias: [
      { find: /^@guideflow\/core\/(.+)$/, replacement: path.resolve(__dirname, '../../packages/core/src/$1.ts') },
      { find: '@guideflow/core', replacement: path.resolve(__dirname, '../../packages/core/src/index.ts') },
      { find: '@guideflow/react', replacement: path.resolve(__dirname, '../../packages/react/src/index.ts') },
      { find: '@guideflow/ai', replacement: path.resolve(__dirname, '../../packages/ai/src/index.ts') },
      { find: '@guideflow/analytics', replacement: path.resolve(__dirname, '../../packages/analytics/src/index.ts') },
    ],
  },
})
