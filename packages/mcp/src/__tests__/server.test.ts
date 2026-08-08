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

/**
 * A flow with something to translate: tokens, a chapter label, and a step whose
 * id collides with a state's.
 */
const I18N = {
  id: 'onboarding',
  initial: 'welcome',
  states: {
    welcome: {
      label: 'Getting started',
      steps: [
        {
          id: 'hello',
          content: {
            title: 'Welcome back, {{firstName}}',
            body: 'You are on {{plan|the free plan}}.',
          },
        },
        // A STEP called `welcome`, in a STATE called `welcome`. The two are
        // separate namespaces and one flat catalogue would collide them.
        { id: 'welcome', content: { title: 'Your workspace' } },
      ],
      on: { NEXT: 'done' },
    },
    done: { steps: [{ id: 'bye', content: { title: 'All set' } }], final: true },
  },
}

/** Two steps sharing an id — an ERROR in the core validator, not a warning. */
const DUPES = {
  id: 'dupes',
  initial: 'a',
  states: {
    a: { steps: [{ id: 'same', content: { title: 'First' } }], on: { NEXT: 'b' } },
    b: { steps: [{ id: 'same', content: { title: 'Second' } }], final: true },
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
  it('advertises exactly the six tools, all read-only', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'guideflow_author_flow',
      'guideflow_extract_strings',
      'guideflow_get_flow',
      'guideflow_list_flows',
      'guideflow_translate_flow',
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

describe('guideflow_extract_strings', () => {
  it('emits the catalogue skeleton with the original copy in it', async () => {
    const out = payload(await call('guideflow_extract_strings', { flow: I18N }))
    const catalogue = out['catalogue'] as {
      steps: Record<string, Record<string, string>>
      states: Record<string, string>
    }

    expect(out['flowId']).toBe('onboarding')
    // Inline, so there is no file it came from — and saying so beats an
    // invented path a model might then try to write to.
    expect(out['path']).toBeNull()
    expect(catalogue.steps['hello']).toEqual({
      title: 'Welcome back, {{firstName}}',
      body: 'You are on {{plan|the free plan}}.',
    })
    expect(out['stringCount']).toBe(5)
  })

  it('keeps step ids and state ids in separate maps', async () => {
    const out = payload(await call('guideflow_extract_strings', { flow: I18N }))
    const catalogue = out['catalogue'] as {
      steps: Record<string, unknown>
      states: Record<string, string>
    }
    // Both are called `welcome` and they mean different things. One flat map
    // would have overwritten the step's copy with the chapter label.
    expect(catalogue.steps['welcome']).toEqual({ title: 'Your workspace' })
    expect(catalogue.states['welcome']).toBe('Getting started')
  })

  it('names the tokens that must survive translation', async () => {
    const out = payload(await call('guideflow_extract_strings', { flow: I18N }))
    expect(out['tokens']).toEqual({
      'steps.hello.title': ['firstName'],
      'steps.hello.body': ['plan'],
    })
  })

  it('reads a flow off disk by path and by id', async () => {
    const byPath = payload(
      await call('guideflow_extract_strings', { path: 'tours/welcome.flow.json' }),
    )
    expect(byPath['path']).toBe('tours/welcome.flow.json')
    expect((byPath['catalogue'] as { steps: Record<string, unknown> }).steps['s1']).toEqual({
      title: 'One',
    })

    const byId = payload(await call('guideflow_extract_strings', { flowId: 'welcome' }))
    expect(byId['path']).toBe('tours/welcome.flow.json')
  })

  it('refuses a flow that does not validate, and says where to look', async () => {
    // A catalogue keyed on ids the engine would reject matches nothing at
    // runtime, in silence — a skeleton for it is worse than no skeleton.
    const result = await call('guideflow_extract_strings', { flow: DANGLING })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('guideflow_validate_flow')
  })

  it('refuses a flow with duplicate step ids, rather than warning about it', async () => {
    // The catalogue engine used to carry its own `duplicate-step-id` WARNING.
    // It could never fire: `duplicate-step-id` is an ERROR in the core
    // validator (authoring.ts:370) and `resolveFlowSource` refuses any flow
    // the validator rejected, so this is the answer a client actually gets.
    // The warning was deleted; this is what replaced it.
    const result = await call('guideflow_extract_strings', { flow: DUPES })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('guideflow_validate_flow')
    // And the refusal is honest about the reason, so an agent can fix it
    // without a second round trip.
    expect(result.content[0]?.text).toContain('same')
  })

  it('refuses more than one source, and none', async () => {
    expect((await call('guideflow_extract_strings', { path: 'a', flowId: 'b' })).isError).toBe(true)
    expect((await call('guideflow_extract_strings')).isError).toBe(true)
  })
})

describe('guideflow_translate_flow', () => {
  /** A faithful Spanish translation of I18N. */
  const ES = {
    steps: {
      hello: { title: 'Hola de nuevo, {{firstName}}', body: 'Estás en {{plan|el plan gratuito}}.' },
      welcome: { title: 'Tu espacio' },
      bye: { title: 'Todo listo' },
    },
    states: { welcome: 'Primeros pasos' },
  }

  it('passes a faithful translation and hands back the bytes to save', async () => {
    const out = payload(
      await call('guideflow_translate_flow', { flow: I18N, locale: 'es', catalogue: ES }),
    )
    expect(out['valid']).toBe(true)
    expect(out['errorCount']).toBe(0)
    expect(out['issues']).toEqual([])
    expect(out['coverage']).toMatchObject({ total: 5, translated: 5 })
    expect(out['suggestedPath']).toBe('onboarding.es.json')
    // What it hands back must round-trip: a client writes these bytes and
    // passes the parsed result to registerContent.
    expect(JSON.parse(out['fileContents'] as string)).toEqual(ES)
  })

  it('catches a {{token}} lost in translation — the check the tool exists for', async () => {
    // Nothing throws and nothing logs: the sentence simply renders without the
    // name, in one locale, for as long as nobody on the team reads it.
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { hello: { title: 'Hola de nuevo' } } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    const lost = issues.find((i) => i['code'] === 'token-lost')
    expect(lost?.['severity']).toBe('error')
    expect(lost?.['path']).toBe('steps.hello.title')
    expect(lost?.['message']).toContain('{{firstName}}')
    expect(out['valid']).toBe(false)
  })

  it('accepts a translated fallback, because only the token name is compared', async () => {
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { hello: { body: 'Estás en {{plan|el plan gratuito}}.' } } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.some((i) => i['code'] === 'token-lost')).toBe(false)
  })

  it('catches a key that resolves to nothing, in either namespace', async () => {
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { helo: { title: 'Hola' } }, states: { hello: 'Paso' } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.find((i) => i['code'] === 'unknown-step')?.['path']).toBe('steps.helo')
    // `hello` IS a real step id — and it is not a state id, so as a chapter
    // label it reaches nothing. The namespaces do not fall back to each other.
    expect(issues.find((i) => i['code'] === 'unknown-state')?.['path']).toBe('states.hello')
    expect(out['valid']).toBe(false)
  })

  it('catches a field the original step does not have', async () => {
    // `{ ...content, ...override }` ADDS it, so the line exists in Spanish and
    // in no other locale.
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { bye: { body: 'Nos vemos' } } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.find((i) => i['code'] === 'field-not-in-original')?.['path']).toBe('steps.bye.body')
  })

  it('catches an empty value, which blanks the copy rather than falling through', async () => {
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { bye: { title: '' } } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.some((i) => i['code'] === 'empty-override')).toBe(true)
  })

  it('catches a key that names something on Object.prototype', async () => {
    // Through the real protocol, because this is a JSON key arriving from a
    // model: `toString` resolves to a function through the prototype chain, so
    // a bare `flow.states[key]` graded it as a real state and the tool answered
    // `valid: true` plus `fileContents` for a catalogue that reaches nothing.
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { states: { toString: 'Primeros pasos' } },
      }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.find((i) => i['code'] === 'unknown-state')?.['path']).toBe('states.toString')
    expect(out['valid']).toBe(false)
    expect(out['fileContents']).toBeUndefined()
  })

  it('never reports translating more strings than the flow has', async () => {
    // `translated` used to count every string in the supplied maps, so a
    // catalogue adding fields the flow does not have reported more translated
    // than there are to translate — "8 of 5", off the only number anyone reads.
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: {
          steps: {
            hello: { title: 'Hola', body: 'Cuerpo', html: '<p>Extra</p>' },
            welcome: { title: 'Tu espacio', body: 'Extra' },
            bye: { title: 'Todo listo' },
          },
          states: { welcome: 'Primeros pasos', done: 'Terminado' },
        },
      }),
    )
    const coverage = out['coverage'] as { total: number; translated: number }
    expect(coverage.total).toBe(5)
    expect(coverage.translated).toBe(5)
  })

  it('withholds the bytes when there are errors', async () => {
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { nope: { title: 'Hola' } } },
      }),
    )
    expect(out['valid']).toBe(false)
    expect(out['fileContents']).toBeUndefined()
    expect(out['suggestedPath']).toBeUndefined()
  })

  it('treats an incomplete translation as a warning, not a failure', async () => {
    // An absent key falls through to the flow's own copy, which is a working
    // page in the wrong language — not a broken tour.
    const out = payload(
      await call('guideflow_translate_flow', {
        flow: I18N,
        locale: 'es',
        catalogue: { steps: { bye: { title: 'Todo listo' } } },
      }),
    )
    expect(out['valid']).toBe(true)
    expect(out['warningCount']).not.toBe(0)
    expect(out['coverage']).toMatchObject({ total: 5, translated: 1 })
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues.some((i) => i['code'] === 'incomplete-translation')).toBe(true)
  })

  it('does not throw on rubbish, and says what the shape should be', async () => {
    const out = payload(
      await call('guideflow_translate_flow', { flow: I18N, locale: 'es', catalogue: 'hola' }),
    )
    const issues = out['issues'] as Array<Record<string, string>>
    expect(issues[0]?.['code']).toBe('not-an-object')
    expect(issues[0]?.['hint']).toContain('guideflow_extract_strings')
  })

  it('checks a flow read off disk, by id', async () => {
    const out = payload(
      await call('guideflow_translate_flow', {
        flowId: 'welcome',
        locale: 'fr',
        catalogue: { steps: { s1: { title: 'Un' }, s2: { title: 'Deux' } } },
      }),
    )
    expect(out['valid']).toBe(true)
    expect(out['suggestedPath']).toBe('welcome.fr.json')
  })

  it('writes no files', async () => {
    // The whole package is read-only: it returns bytes, the client saves them.
    const before = payload(await call('guideflow_list_flows'))['total']
    await call('guideflow_translate_flow', { flow: I18N, locale: 'es', catalogue: ES })
    expect(payload(await call('guideflow_list_flows'))['total']).toBe(before)
  })
})
