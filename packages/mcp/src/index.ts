#!/usr/bin/env node
// ---------------------------------------------------------------------------
// `guideflow-mcp` — the stdio entry point.
//
// stdio, not HTTP: this reads the operator's own filesystem, so it belongs in
// the operator's own process rather than behind a port anything on the machine
// could reach.
//
// NOTHING may write to stdout except the transport. A stray console.log is
// framed as a JSON-RPC message and corrupts the stream — the single most common
// way an MCP server appears to "hang". Diagnostics go to stderr.
// ---------------------------------------------------------------------------

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resolveRoot } from './root.js'
import { createServer } from './server.js'
import { VERSION } from './version.js'

/**
 * The root comes from the OPERATOR, never from a tool argument.
 *
 * `--root <dir>`, else `GUIDEFLOW_ROOT`, else the working directory the client
 * launched us in. A `root` parameter on a tool would let a model that had been
 * talked into it point the server anywhere on the disk, which is the whole
 * attack this server has to not be vulnerable to.
 */
function readRoot(argv: string[]): string {
  const flag = argv.indexOf('--root')
  if (flag !== -1) {
    const value = argv[flag + 1]
    if (value === undefined || value.startsWith('--')) {
      process.stderr.write('guideflow-mcp: --root needs a directory.\n')
      process.exit(2)
    }
    return resolveRoot(value)
  }
  const env = process.env['GUIDEFLOW_ROOT']
  return resolveRoot(env !== undefined && env !== '' ? env : process.cwd())
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      `guideflow-mcp ${VERSION}\n\n` +
        'A read-only MCP server exposing GuideFlow flow authoring and validation.\n\n' +
        'Usage: guideflow-mcp [--root <dir>]\n\n' +
        '  --root <dir>   Directory to scope every file read to.\n' +
        '                 Defaults to $GUIDEFLOW_ROOT, then the working directory.\n\n' +
        'It speaks MCP over stdio. Add it to your client, do not run it by hand.\n',
    )
    return
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  const root = readRoot(argv)
  // stderr: stdout is the JSON-RPC channel.
  process.stderr.write(`guideflow-mcp ${VERSION} — root ${root}\n`)

  const server = createServer(root, VERSION)
  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  process.stderr.write(`guideflow-mcp: ${(error as Error).message}\n`)
  process.exit(1)
})
