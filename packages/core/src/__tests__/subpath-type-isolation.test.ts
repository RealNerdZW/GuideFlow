/**
 * A subpath's public signatures must never name one of core's CLASSES.
 *
 * `packages/core/tsup.config.ts` is seven configs, each with `dts: true`, and
 * rollup-dts bundles per entry: it does not emit an `import` back into the main
 * entry's declarations, it **inlines the whole transitive type graph** into each
 * subpath file. `dist/targeting/index.d.ts` used to contain zero import
 * statements and its own copies of `I18nRegistry`, `ProgressStore` and
 * `EventEmitter`.
 *
 * Duplicated *interfaces* unify structurally and cost nothing. A duplicated
 * **class with a `private` member is nominally typed**, so the copy inlined into
 * a subpath and the copy in `dist/index.d.ts` can never unify. That is what made
 *
 *   createTargeting(createGuideFlow({}))
 *
 * a TS2345 for every published consumer through 0.1.9, with an error chain
 * ending in "Types have separate declarations of a private property '_locales'".
 *
 * **Nothing in this repo could see it.** Every in-repo caller resolves
 * `@guideflow/core` through tsconfig `paths` to `src`, so they all share one
 * copy of the graph; `dist` is only ever type-checked by a consumer, and there
 * are none here. `scripts/check-dist-types.mjs` compiles a scratch package
 * against the built `dist` through the real `exports` map, which is the only
 * arrangement that reproduces it — but it needs a build. This file is the fast
 * half: it fails in milliseconds, at the source, naming the import to remove.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { createGuideFlow } from '../index.js'
import { advanceOn, type AdvanceOnHost } from '../navigation/advance.js'
import { createTargeting, type TargetingHost } from '../targeting/index.js'
import type { FlowDefinition, GuidanceContext } from '../types/index.js'

// Same idiom as e2e-fixture.test.ts. `new URL('../', import.meta.url)` is NOT
// equivalent under vitest — it throws ERR_INVALID_URL_SCHEME.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every module that declares an exported class, as a relative specifier a
 * subpath might plausibly write.
 *
 * `../index.js` is on the list because `GuideFlowInstance` and
 * `GuideFlowConfig` both *reach* a class — `configure → GuideFlowConfig →
 * renderer → RendererContract → setI18n → I18nRegistry`. That is exactly how
 * `@guideflow/core/navigation` would fail despite declaring no class of its own,
 * so the transitive case is the one that matters.
 *
 * Not every class here has a private member today. The rule is "no classes"
 * rather than "no classes with privates" on purpose: adding a `private` field to
 * a class is an ordinary, invisible refactor that would silently break a
 * consumer months later.
 *
 * ## What this list deliberately CANNOT catch
 *
 * `types/index.js` is **not** on it, and must not be: both subpaths import from
 * it today and are correct to. It is *conditionally* class-bearing — it imports
 * `I18nRegistry` for `GuideFlowConfig`/`GuideFlowInstance`, but `Step`,
 * `GuidanceContext`, `TourEvents` and `FlowDefinition` reach no class at all.
 * MEASURED: both subpaths import `../types/index.js` and `dist/targeting/*.d.ts`
 * still emits zero `declare class`. Banning the module would fail correct code;
 * allowing it means a subpath that later imports `GuideFlowConfig` from the same
 * barrel reintroduces the bug and this test stays green.
 *
 * That hole is why `scripts/check-dist-types.mjs` exists and is the AUTHORITY —
 * it compiles a real consumer against the emitted `.d.ts`, so it measures the
 * outcome rather than a proxy for it. This test is a fast pre-filter that fails
 * in milliseconds instead of after a build; it is not a substitute. Do not
 * delete the dist check on the strength of this one passing.
 */
const CLASS_BEARING = [
  'index.js',
  'engine/hint.js',
  'engine/hotspot.js',
  'engine/spotlight.js',
  'engine/tour.js',
  'fsm/machine.js',
  'i18n/index.js',
  'persistence/broadcast-sync.js',
  'persistence/drivers.js',
  'persistence/progress-store.js',
  'renderer/default-renderer.js',
  'utils/emitter.js',
]

/** The two subpaths that accept a live GuideFlow instance. */
const SUBPATH_DIRS = ['targeting', 'navigation']

function tsFilesIn(dir: string): string[] {
  return readdirSync(join(SRC, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(SRC, dir, f))
}

describe('subpath type isolation', () => {
  it('the class inventory is complete — a new exported class must join CLASS_BEARING', () => {
    // Without this the allow-list rots silently: someone adds
    // `export class FooRegistry`, a subpath imports it, and the check above
    // passes because the module was never on the list.
    const found: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = dir === '' ? entry.name : `${dir}/${entry.name}`
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'styles') continue
          walk(rel)
        } else if (entry.name.endsWith('.ts')) {
          const source = readFileSync(join(SRC, rel), 'utf8')
          if (/^export (abstract )?class /m.test(source)) {
            found.push(rel.replace(/\.ts$/, '.js'))
          }
        }
      }
    }
    walk('')

    // `index.js` declares no class itself; it is on the list because it re-
    // exports and composes them. Everything else must be discovered.
    expect(found.sort()).toEqual(CLASS_BEARING.filter((m) => m !== 'index.js').sort())
  })

  for (const dir of SUBPATH_DIRS) {
    it(`src/${dir} imports no class-bearing module`, () => {
      const offenders: string[] = []
      for (const file of tsFilesIn(dir)) {
        const source = readFileSync(file, 'utf8')
        // Anchored to a real statement. An unanchored /from '…'/ also matches
        // the specifier quoted inside this file's own explanatory comments —
        // measured, and it read exactly like a genuine violation.
        for (const spec of source.matchAll(
          /^\s*(?:import|export)\b[^\n]*?from '(\.\.?\/[^']+)'/gm,
        )) {
          const target = spec[1]
          if (target === undefined) continue
          // Resolve `../x/y.js` and `./y.js` against this subpath directory.
          const resolved = target.startsWith('../')
            ? target.slice(3)
            : `${dir}/${target.slice(2)}`
          if (CLASS_BEARING.includes(resolved)) {
            offenders.push(`${dir}/${file.split(/[\\/]/).pop() ?? ''} → ${target}`)
          }
        }
      }
      expect(
        offenders,
        'A subpath signature naming a class is inlined as a NOMINAL duplicate by ' +
        'rollup-dts and cannot unify with the copy in dist/index.d.ts. Use a ' +
        'structural host interface (see TargetingHost / AdvanceOnHost).',
      ).toEqual([])
    })
  }

  it('a real instance still satisfies both structural hosts', () => {
    // The compile-time half. If someone widens TargetingHost or AdvanceOnHost
    // with a member the instance does not carry, this stops compiling — which
    // the dist guard would also catch, but only after a full build.
    interface Ctx extends GuidanceContext { plan: string }
    const gf = createGuideFlow<Ctx>({ context: { plan: 'pro' } })
    const targetingHost: TargetingHost<Ctx> = gf
    const advanceHost: AdvanceOnHost = gf
    expect(targetingHost.isActive).toBe(false)
    expect(advanceHost.isActive).toBe(false)
    gf.destroy()
  })

  it('createTargeting drives a hand-written host that is not a GuideFlow instance', () => {
    // The behavioural half, and the one that proves the parameter is genuinely
    // structural rather than "a GuideFlowInstance spelled differently". None of
    // this object is an instance of anything core exports.
    const flow: FlowDefinition = {
      id: 'f1',
      initial: 'a',
      targeting: { startTrigger: 'load', priority: 5 },
      states: { a: { steps: [{ id: 's1', content: { body: 'hi' } }] } },
    }
    const records = new Map<string, unknown>()
    const start = vi.fn(async () => {})

    const host: TargetingHost = {
      listFlows: () => [flow],
      start,
      goTo: async () => {},
      isActive: false,
      context: { userId: 'u1' },
      // `Promise.resolve`, not `async` — an async function with no `await` is a
      // `require-await` error, and `--max-warnings 0` makes that fail the build.
      progress: {
        getRecord: <T,>(userId: string, suffix: string) =>
          Promise.resolve((records.get(`${userId}:${suffix}`) ?? null) as T | null),
        setRecord: <T,>(userId: string, suffix: string, value: T) => {
          records.set(`${userId}:${suffix}`, value)
          return Promise.resolve()
        },
        isCompleted: () => Promise.resolve(false),
        isDismissed: () => Promise.resolve(false),
      },
      on: () => () => {},
    }

    const targeting = createTargeting(host)
    return targeting.autoStart('load').then((started) => {
      expect(started?.id).toBe('f1')
      expect(start).toHaveBeenCalledWith(flow)
      targeting.destroy()
    })
  })

  it('advanceOn drives a hand-written host too', () => {
    const listeners = new Map<string, (payload: never) => void>()
    let offCount = 0
    const host: AdvanceOnHost = {
      on: (event, listener) => {
        listeners.set(event, listener as (payload: never) => void)
        return () => { offCount += 1 }
      },
      next: () => undefined,
      send: () => undefined,
      currentStep: null,
      isActive: false,
      isPaused: false,
    }
    const stop = advanceOn(host, { s1: 'click' })
    expect(listeners.has('step:enter')).toBe(true)
    stop()
    // One `off` per subscription: step:enter, step:exit, tour:complete,
    // tour:abandon, tour:pause, step:waiting.
    expect(offCount).toBe(6)
  })
})
