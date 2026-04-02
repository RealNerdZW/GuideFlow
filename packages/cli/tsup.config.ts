import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: true,
  // Node built-ins and all deps are external
  external: ['commander', 'inquirer', 'chalk', 'ora', 'vite', 'node:*', 'path', 'fs', 'url'],
  banner: { js: '#!/usr/bin/env node' },
  treeshake: true,
});
