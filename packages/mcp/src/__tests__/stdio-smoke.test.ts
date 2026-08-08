// ---------------------------------------------------------------------------
// The stdout channel, through the real binary.
//
// **This test did not exist.** `CLAUDE.md` has said since 7.11 that "the smoke
// test asserts every stdout line parses as JSON", and nothing in this package
// spawned a process — `server.test.ts` drives `InMemoryTransport`, which never
// sees stdout at all. The note outlived a test that was never written.
//
// It is worth having because the failure mode is silence. Anything written to
// stdout by anything in this process is framed as a JSON-RPC message, so one
// `console.log` — in this package, in `@guideflow/core/authoring`, in a
// dependency — corrupts the stream and the client appears to hang with no
// error anywhere. Every other test in this package would still pass.
//
// It also exercises the built artefact: a bad `exports` map, a missing
// external, or an ESM/CJS slip in `dist/` shows up here and nowhere else.
// ---------------------------------------------------------------------------

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const PKG = fileURLToPath(new URL('../..', import.meta.url))
const BIN = join(PKG, 'dist', 'index.js')

interface Rpc {
  jsonrpc: string
  id?: number
  result?: { tools?: Array<{ name: string }> }
}

/**
 * Run the binary, speak MCP at it, and hand back everything both streams said.
 *
 * Newline-delimited JSON, which is what MCP stdio is — no Content-Length
 * framing. The handshake is real because `tools/list` before `initialize` is
 * refused, and a refusal would prove nothing about a working stream.
 */
async function handshake(): Promise<{ stdout: string; stderr: string }> {
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [BIN, '--root', join(PKG, 'src')],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out. stdout: ${stdout}`)), 15_000)
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      // The tools/list reply is the last thing we asked for.
      if (stdout.includes('"id":2')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`exited ${String(code)}. stderr: ${stderr}`))
    })
  })

  const send = (message: unknown): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'stdio-smoke', version: '1.0.0' },
    },
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })

  try {
    await done
  } finally {
    child.kill()
  }
  return { stdout, stderr }
}

describe('the stdio channel', () => {
  // `dist/` is a build output, and turbo's `test` task declares ["^build",
  // "build"] so it is there in CI and in the verification gate. A bare
  // `vitest run` in a clean checkout is the one case it is not, and failing
  // there would read as a product bug.
  const built = existsSync(BIN)

  it.runIf(built)(
    'writes nothing to stdout that is not a JSON-RPC message',
    async () => {
      const { stdout, stderr } = await handshake()
      const lines = stdout.split('\n').filter((l) => l.trim() !== '')
      expect(lines.length).toBeGreaterThan(0)

      for (const line of lines) {
        // The assertion that matters. A `console.log` anywhere in the process
        // lands here as a line that is not JSON, and the only symptom a user
        // ever sees is a client that hangs.
        const parsed = JSON.parse(line) as Rpc
        expect(parsed.jsonrpc, line).toBe('2.0')
      }

      // …and the startup banner went to the other stream, where it belongs.
      expect(stderr).toContain('guideflow-mcp')
      expect(stdout).not.toContain('guideflow-mcp —')
    },
    20_000,
  )

  it.runIf(built)(
    'serves the real tool list through the built binary',
    async () => {
      const { stdout } = await handshake()
      const reply = stdout
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => JSON.parse(l) as Rpc)
        .find((m) => m.id === 2)
      const names = (reply?.result?.tools ?? []).map((t) => t.name).sort()
      expect(names).toEqual([
        'guideflow_author_flow',
        'guideflow_extract_strings',
        'guideflow_get_flow',
        'guideflow_list_flows',
        'guideflow_translate_flow',
        'guideflow_validate_flow',
      ])
    },
    20_000,
  )

  it('has no console.log in the source, which is the usual cause', () => {
    // A static check, so it runs with or without a build — and points at the
    // file rather than at a stream that stopped parsing.
    const dir = join(PKG, 'src')
    const offenders: string[] = []
    const walk = (path: string): void => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const full = join(path, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          if (/\bconsole\.log\s*\(/.test(readFileSync(full, 'utf-8'))) offenders.push(entry.name)
        }
      }
    }
    walk(dir)
    expect(offenders).toEqual([])
  })
})
