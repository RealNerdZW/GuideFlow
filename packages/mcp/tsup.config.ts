import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'tsup'

// The server's version lives in exactly one place: this package's
// package.json. It is substituted into src/version.ts through `define`, so the
// version an MCP client sees in the handshake cannot drift from the one
// changesets published — the same arrangement @guideflow/devtools uses for its
// extension manifest.
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string }

export default defineConfig({
  entry: { index: 'src/index.ts' },
  // ESM only. This is a bin, not a library: nothing `require`s it, and a dual
  // build would double the surface for no consumer.
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  target: 'node18',
  platform: 'node',
  // Real runtime dependencies, resolved from the consumer's node_modules.
  // Bundling the SDK would ship a second copy of its transport and its zod.
  external: ['@guideflow/core', '@guideflow/core/authoring', '@guideflow/core/versioning', '@modelcontextprotocol/sdk', 'zod'],
  define: { __GF_MCP_VERSION__: JSON.stringify(version) },
  banner: { js: '/* @guideflow/mcp — MIT License */' },
})
