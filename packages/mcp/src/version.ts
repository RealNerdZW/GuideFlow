/**
 * The one place the server's version comes from.
 *
 * Substituted at build time from package.json by tsup's `define`, so it cannot
 * drift from the version changesets publishes — the same trick
 * `@guideflow/devtools` uses for its manifest.
 */
declare const __GF_MCP_VERSION__: string

export const VERSION: string =
  typeof __GF_MCP_VERSION__ === 'string' ? __GF_MCP_VERSION__ : '0.0.0-dev'
