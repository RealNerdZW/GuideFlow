import { defineConfig } from 'tsup'

// Two configs, so the widget tree-shakes away for a headless consumer.
//
// `clean` is false on BOTH. tsup runs an array config concurrently, so a clean
// in one entry races the other's .d.ts writes and deletes them with no build
// error — the failure `scripts/verify-pack.mjs` caught in core's five-config
// array. `dist` is removed once, up front, by the build script.
//
// `external` lists the subpaths explicitly as well as the bare specifier. The
// bare name alone does in fact cover them (esbuild treats an external entry as
// a package-name prefix, and `verify-pack.mjs` would catch a bundled copy), but
// this package imports `@guideflow/core/targeting` and `/navigation` where the
// checklist imports nothing beyond the root — so the guarantee is worth
// spelling out rather than inheriting by accident.
const EXTERNAL = ['@guideflow/core', '@guideflow/core/targeting', '@guideflow/core/navigation']

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2020',
    external: EXTERNAL,
    banner: { js: '/* @guideflow/survey — MIT License */' },
  },
  {
    entry: { 'widget/index': 'src/widget/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2020',
    external: EXTERNAL,
    banner: { js: '/* @guideflow/survey/widget — MIT License */' },
  },
])
