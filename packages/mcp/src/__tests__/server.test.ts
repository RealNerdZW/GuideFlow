// ---------------------------------------------------------------------------
// The tools, driven through a real MCP client.
//
// `InMemoryTransport` rather than calling the handlers directly: that exercises
// the actual protocol path — schema validation, serialisation, the tool
// registry — so a tool whose Zod schema disagrees with its handler fails here
// rather than in someone's client.
// ---------------------------------------------------------------------------

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { resolveRoot } from '../root.js'
import { createServer } from '../server.js'

let root: string
let sandbox: string
let client: Client

/** A flow the engine will actually run. */
const GOOD = {
  gfFlowFile: 1,
  flow: {
    id: 'welcome',
    initial: 'intro',
    states: {
      intro: {
        steps: [{ id: 's1', target: '#a', content: { title: 'One' } }],
        on: { NEXT: 'outro' },
      },
      outro: { steps: [{ id: 's2', content: { title: 'Two' } }], final: true },
    },
  },
}

/** A transition naming a state that does not exist. */
const DANGLING = {
  id: 'broken',
  initial: 'a',
  states: { a: { steps: [{ id: 's', content: { title: 't' } }], on: { NEXT: 'ghost' } } },
}

interface ToolResult {
  isError?: boolean
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult
}

/** The structured payload, or throw with the error text so failures read well. */
function payload(result: ToolResult): Record<string, unknown> {
  if (result.isError) throw new Error(`tool returned an error: ${result.content[0]?.text ?? ''}`)
  return result.structuredContent ?? (JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>)
}

beforeAll(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'gf-mcp-srv-'))
  root = resolveRoot(sandbox)
  mkdirSync(join(root, 'tours'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })

  writeFileSync(join(root, 'tours', 'welcome.flow.json'), JSON.stringify(GOOD, null, 2))
  writeFileSync(join(root, 'tours', 'broken.flow.json'), JSON.stringify(DANGLING, null, 2))
  writeFileSync(join(root, 'tours', 'garbage.flow.json'), '{ not json')
  // Must NOT be listed: node_modules is skipped, and a non-flow file ignored.
  writeFileSync(join(root, 'node_modules', 'pkg', 'vendor.flow.json'), JSON.stringify(GOOD))
  writeFileSync(join(root, 'tours', 'notes.txt'), 'not a flow')
  writeFileSync(join(root, 'secret.txt'), 'top secret')

  const server = createServer(root, '0.0.0-test')
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
})

afterAll(async () => {
  // Optional-chained: if `beforeAll` threw, `client` is undefined and an
  // unguarded close() here replaces the real error with a TypeError.
  await client?.close()
  try {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    /* the OS will reap it */
  }
})

describe('the tool registry', () => {
  it('advertises exactly the four tools, all read-only', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'guideflow_author_flow',
      'guideflow_get_flow',
      'guideflow_list_flows',
      'guideflow_validate_flow',
    ])
    // No tool writes anything. Authoring returns bytes and lets the client's
    // own file tools save them, under the operator's existing permissions.
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false)
    }
  })

  it('every tool is namespaced, so it cannot collide with another server', async () => {
    const { tools } = await client.listTools()
    for (const tool of tools) expect(tool.name.startsWith('guideflow_')).toBe(true)
  })
})

describe('guideflow_list_flows', () => {
  it('lists the flow files with a health summary', async () => {
    const out = payload(await call('guideflow_list_flows'))
    const flows = out['flows'] as Array<Record<string, unknown>>

    expect(out['total']).toBe(3)
    const welcome = flows.find((f) => f['id'] === 'welcome')
    expect(welcome).toMatchObject({ valid: true, errorCount: 0, path: 'tours/welcome.flow.json' })
    // Steps are counted by walking NEXT from `initial`, not by summing every
    // state's array — the distinction that put a Done button on step one.
    expect(welcome?.['stepCount']).toBe(2)
    expect(welcome?.['fingerprint']).toEqual(expect.any(String))
  })

  it('reports an invalid flow without failing the listing, and still names it', async () => {
    const flows = payload(await call('guideflow_list_flows'))['flows'] as Array<
      Record<string, unknown>
    >
    // `validateFlow` withholds the flow when it is invalid, so the id has to be
    // recovered from the raw JSON — otherwise "which file is the broken tour?"
    // is unanswerable, which is exactly when you ask it.
    expect(flows.find((f) => f['id'] === 'broken')).toMatchObject({ valid: false })
    // Unparseable JSON still appears, so an agent can see the file exists.
    expect(flows.find((f) => f['path'] === 'tours/garbage.flow.json')).toMatchObject({
      id: null,
      valid: false,
    })
  })

  it('skips node_modules and non-flow files', async () => {
    const flows = payload(await call('guideflow_list_flows'))['flows'] as Array<
      Record<string, unknown>
    >
    expect(flows.some((f) => String(f['path']).includes('node_modules'))).toBe(false)
    expect(flows.some((f) => String(f['path']).endsWith('notes.txt'))).toBe(false)
  })

  it('paginates', async () => {
    const first = payload(await call('guideflow_list_flows', { limit: 2, offset: 0 }))
    expect(first['count']).toBe(2)
    expect(first['has_more']).toBe(true)
    expect(first['next_offset']).toBe(2)

    const second = payload(await call('guideflow_list_flows', { limit: 2, offset: 2 }))
    expect(second['count']).toBe(1)
    expect(second['has_more']).toBe(false)
  })

  it('uses forward slashes on every platform', async () => {
    const flows = payload(await call('guideflow_list_flows'))['flows'] as Array<
      Record<string, unknown>
    >
    for (const f of flows) expect(String(f['path'])).not.toContain('\\')
  })
})

describe('guideflow_get_flow', () => {
  it('reads by path, with the derived facts', async () => {
    const out = payload(await call('guideflow_get_flow', { path: 'tours/welcome.flow.json' }))
    expect(out['valid']).toBe(true)
    expect(out['stepCount']).toBe(2)
    expect((out['flow'] as { id: string }).id).toBe('welcome')
  })

  it('reads by flow id', async () => {
    const out = payload(await call('guideflow_get_flow', { flowId: 'welcome' }))
    expect(out['path']).toBe('tours/welcome.flow.json')
  })

  it('refuses both arguments, and neither', async () => {
    expect((await call('guideflow_get_flow', { path: 'a', flowId: 'b' })).isError).toBe(true)
    expect((await call('guideflow_get_flow')).isError).toBe(true)
  })

  it('says what to do when the id does not exist', async () => {
    const result = await call('guideflow_get_flow', { flowId: 'nope' })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('guideflow_list_flows')
  })

  it('refuses a path outside the root, and says why', async () => {
    // The whole security surface of this server, through the real protocol.
    const result = await call('guideflow_get_flow', { path: '../../../etc/passwd' })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('outside the server')
  })

  it('refuses a sibling file inside the root that is not a flow', async () => {
    // secret.txt IS inside the root, so this is not a sandbox failure — it is
    // parsed, found not to be a flow, and reported as invalid rather than dumped.
    const out = payload(await call('guideflow_get_flow', { path: 'secret.txt' }))
    expect(out['valid']).toBe(false)
    expect(out['flow']).toBeNull()
  })
})

describe('guideflow_validate_flow', () => {
  it('accepts a valid flow', async () => {
    const out = payload(await call('guideflow_validate_flow', { flow: GOOD.flow }))
    expect(out['valid']).toBe(true)
    expect(out['errorCount']).toBe(0)
  })

  it('unwraps a flow-file envelope', async () => {
    const out = payload(await call('guideflow_validate_flow', { flow: GOOD }))
    expect(out['valid']).toBe(true)
  })

  it('catches a dangling transition, with a fix', async () => {
    // The failure this rule exists for: the engine truncates the tour AND
    // records it as completed, so it never shows again.
    const out = payload(await call('guideflow_validate_flow', { flow: DANGLING }))
    expect(out['valid']).toBe(false)
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.some((i) => i['severity'] === 'error')).toBe(true)
    for (const issue of issues) {
      expect(issue['hint']).toBeTruthy()
      expect(issue['code']).toBeTruthy()
    }
  })

  it('does not throw on rubbish input', async () => {
    const out = payload(await call('guideflow_validate_flow', { flow: 42 }))
    expect(out['valid']).toBe(false)
  })
})

describe('guideflow_author_flow', () => {
  it('turns a step list into a valid flow file', async () => {
    const out = payload(
      await call('guideflow_author_flow', {
        id: 'dashboard-tour',
        name: 'Dashboard tour',
        steps: [
          { id: 'one', title: 'Charts', body: 'Your numbers.', target: '#charts' },
          { id: 'two', title: 'Filters', target: '#filters' },
        ],
      }),
    )

    expect(out['valid']).toBe(true)
    expect(out['suggestedPath']).toBe('dashboard-tour.flow.json')

    const contents = out['fileContents'] as string
    const reparsed = JSON.parse(contents) as { gfFlowFile: number; flow: { id: string } }
    expect(reparsed.gfFlowFile).toBe(1)
    expect(reparsed.flow.id).toBe('dashboard-tour')

    // The bytes it hands back must themselves validate — otherwise the tool
    // has told the model to write something the engine will mishandle.
    const check = payload(await call('guideflow_validate_flow', { flow: reparsed }))
    expect(check['valid']).toBe(true)
  })

  it('supports a centred modal announcement', async () => {
    // target: null is a supported shape, not a workaround.
    const out = payload(
      await call('guideflow_author_flow', {
        id: 'notice',
        name: 'Notice',
        steps: [{ id: 'only', title: 'We shipped v2', target: null }],
      }),
    )
    expect(out['valid']).toBe(true)
  })

  it('rejects duplicate step ids by name', async () => {
    // goTo(), resume and the showIf skip loop all resolve the first match, so
    // duplicates are silently wrong at runtime rather than loudly wrong here.
    const result = await call('guideflow_author_flow', {
      id: 'dupes',
      name: 'Dupes',
      steps: [
        { id: 'same', title: 'One' },
        { id: 'same', title: 'Two' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('same')
  })

  it('rejects an empty step list at the schema boundary', async () => {
    // The SDK reports a schema violation as a tool error rather than a
    // transport rejection, which is what a client shows the model.
    const result = await call('guideflow_author_flow', { id: 'x', name: 'X', steps: [] })
    expect(result.isError).toBe(true)
  })

  it('writes no files', async () => {
    // The tool is read-only by design: it returns bytes and lets the client
    // save them under the operator's existing permissions.
    const before = payload(await call('guideflow_list_flows'))['total']
    await call('guideflow_author_flow', {
      id: 'ephemeral',
      name: 'Ephemeral',
      steps: [{ id: 'one', title: 'One' }],
    })
    expect(payload(await call('guideflow_list_flows'))['total']).toBe(before)
  })
})
