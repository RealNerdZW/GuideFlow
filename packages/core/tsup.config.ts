import { defineConfig } from 'tsup'

/**
 * Two config objects, not two entries in one.
 *
 * The main bundle emits an IIFE with a `GuideFlow` global; a subpath must not.
 * `clean: true` also belongs to exactly one of them — the second would wipe the
 * first's output. Subpaths are declared here AND in package.json `exports`;
 * `scripts/verify-pack.mjs` fails CI if the two drift.
 */
export default defineConfig([{
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'GuideFlow',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: {
    js: '/* GuideFlow core — MIT License — https://guideflow.dev */',
  },
}, {
  // @guideflow/core/html — opt-in `content.html` sanitisation. Evicted from the
  // default bundle per ADR-008's condition; see src/html.ts for the rationale.
  entry: { html: 'src/html.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: {
    js: '/* GuideFlow core/html — MIT License — https://guideflow.dev */',
  },
}])
