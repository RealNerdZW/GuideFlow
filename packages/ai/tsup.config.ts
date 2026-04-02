import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['openai', '@anthropic-ai/sdk', '@guideflow/core'],
  treeshake: true,
  splitting: false,
});
