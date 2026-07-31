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
  // @guideflow/core/navigation — route-aware target resolution. ~1.6 kB that a
  // single-page tour does not need, so it stays out of the size-gated entry.
  // NOT iife: a second bundle claiming the `GuideFlow` global is nonsense.
  entry: { 'navigation/index': 'src/navigation/index.ts' },
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
    js: '/* GuideFlow core/navigation — MIT License — https://guideflow.dev */',
  },
}, {
  // @guideflow/core/versioning — derive FlowDefinition.version from a flow's
  // shape. Purely computational; no DOM, no browser globals.
  entry: { versioning: 'src/versioning.ts' },
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
  banner: { js: '/* GuideFlow core/versioning — MIT License */' },
}, {
  // @guideflow/core/targeting — who sees a flow, where, and how often. The
  // data lives in core as types; every rule that acts on it lives here.
  entry: { 'targeting/index': 'src/targeting/index.ts' },
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
  banner: { js: '/* GuideFlow core/targeting — MIT License */' },
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
