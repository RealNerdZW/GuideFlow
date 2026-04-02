import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2020',
  external: ['react', 'react-dom', '@guideflow/core'],
  esbuildOptions(opts) {
    opts.jsx = 'automatic'
  },
  banner: {
    js: '/* @guideflow/react — MIT License */',
  },
})
