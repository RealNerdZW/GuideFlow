import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Rollup, which tsup uses for its treeshake pass, strips module-level
  // directives — the "use client" banner below does not survive it. esbuild
  // alone keeps it, and there is nothing to tree-shake in a bundle whose only
  // module is the entry re-export map.
  treeshake: false,
  splitting: false,
  target: 'es2020',
  external: ['react', 'react-dom', '@guideflow/core'],
  esbuildOptions(opts) {
    opts.jsx = 'automatic'
  },
  banner: {
    // tsup strips top-of-file directives while bundling, so the React Server
    // Components client boundary has to be re-emitted here — it must be the
    // first statement of every output file.
    js: "'use client';\n/* @guideflow/react — MIT License */",
  },
})
