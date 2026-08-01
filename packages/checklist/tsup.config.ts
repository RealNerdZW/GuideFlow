import { defineConfig } from 'tsup'

// Two configs, so the widget tree-shakes away for a headless consumer.
//
// `clean` is false on BOTH. tsup runs an array config concurrently, so a clean
// in one entry races the other's .d.ts writes and deletes them with no build
// error — the failure `scripts/verify-pack.mjs` caught in core's five-config
// array. `dist` is removed once, up front, by the build script.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2020',
    // `@guideflow/core` is a peer, never bundled: two copies of the engine
    // means two independent tour states, which is what the peer range exists
    // to prevent.
    external: ['@guideflow/core'],
    banner: { js: '/* @guideflow/checklist — MIT License */' },
  },
  {
    entry: { 'widget/index': 'src/widget/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2020',
    external: ['@guideflow/core'],
    banner: { js: '/* @guideflow/checklist/widget — MIT License */' },
  },
])
