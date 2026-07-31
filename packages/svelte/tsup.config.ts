import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM only, deliberately. Svelte itself is ESM-only — `svelte/store` resolves
  // to an ES module with no `require` condition in both Svelte 4 and 5 — so the
  // CJS bundle we used to emit threw ERR_REQUIRE_ESM on every Node in this
  // package's declared `>=18` range below 22.12. The `require` entry point was
  // advertised and dead; see AUDIT `svelte-cjs-build-cannot-run`.
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['svelte', 'svelte/store', '@guideflow/core'],
  banner: {
    js: '/* @guideflow/svelte — MIT License */',
  },
})
