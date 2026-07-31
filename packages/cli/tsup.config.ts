import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  // package.json advertises a programmatic `exports` entry, so consumers need
  // declarations. With dts:false they got none (AUDIT `cli-exports-no-types`).
  dts: true,
  sourcemap: false,
  clean: true,
  // Node built-ins and all deps are external
  external: ['commander', 'inquirer', 'chalk', 'ora', 'vite', 'node:*', 'path', 'fs', 'url'],
  banner: { js: '#!/usr/bin/env node' },
  treeshake: true,
});
