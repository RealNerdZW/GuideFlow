import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
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
