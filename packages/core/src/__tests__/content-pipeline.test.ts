// ---------------------------------------------------------------------------
// The content pipeline: catalogue override, then {{token}} interpolation.
//
//   the step's own content  ->  locale catalogue  ->  interpolation  ->  renderer
//
// The order is why 8.3 and 8.4 shipped together: a *translated* string
// containing {{firstName}} has to resolve, and it only does if the catalogue is
// applied first. A two-seam design gets exactly that case wrong.
//
// The other thing worth pinning is where this happens. Resolution is in the
// ENGINE, before `renderStep`, so a custom RendererContract receives finished
// content and needs to know nothing about tokens or locales — and so that every
// interpolated value still passes through the renderer's escaping.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import type { FlowDefinition, RendererContract, StepContent } from '../types/index.js'
import { interpolate } from '../utils/interpolate.js'

describe('interpolate', () => {
  it('substitutes a token', () => {
    expect(interpolate('Hi {{name}}', { name: 'Ada' })).toBe('Hi Ada')
  })

  it('substitutes every occurrence', () => {
    expect(interpolate('{{n}} of {{n}}', { n: 2 })).toBe('2 of 2')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('Hi {{  name  }}', { name: 'Ada' })).toBe('Hi Ada')
  })

  it('reads a dotted path', () => {
    expect(interpolate('Hi {{user.first}}', { user: { first: 'Ada' } })).toBe('Hi Ada')
  })

  it('uses the fallback when the value is missing', () => {
    expect(interpolate('Your {{plan|team}} plan', {})).toBe('Your team plan')
    expect(interpolate('Your {{plan|team}} plan', { plan: 'pro' })).toBe('Your pro plan')
  })

  it('treats null and undefined as missing, but keeps 0 and false', () => {
    expect(interpolate('{{a|-}}', { a: null })).toBe('-')
    expect(interpolate('{{a|-}}', { a: undefined })).toBe('-')
    // The classic falsy bug: a count of zero is a real value.
    expect(interpolate('{{a|-}}', { a: 0 })).toBe('0')
    expect(interpolate('{{a|-}}', { a: false })).toBe('false')
  })

  it('leaves an unresolved token as written rather than blanking it', () => {
    // An empty gap in a sentence is a worse failure than a visible token,
    // because nobody notices it.
    expect(interpolate('Hi {{nope}}', {})).toBe('Hi {{nope}}')
  })

  it('does not render [object Object]', () => {
    expect(interpolate('{{u}}', { u: { a: 1 } })).toBe('{{u}}')
    expect(interpolate('{{u|someone}}', { u: { a: 1 } })).toBe('someone')
  })

  it('leaves text with no tokens exactly alone', () => {
    const s = 'Braces { like } this, and 100% of nothing'
    expect(interpolate(s, { like: 'x' })).toBe(s)
  })

  it('does not re-interpolate a value that itself contains a token', () => {
    // One pass, by construction — `String.replace` does not revisit what it
    // just wrote. Otherwise a context value could reach into the context.
    expect(interpolate('{{a}}', { a: '{{b}}', b: 'secret' })).toBe('{{b}}')
  })
})

const flow: FlowDefinition = {
  id: 'content-flow',
  initial: 'intro',
  states: {
    intro: {
      label: 'Getting started',
      steps: [{ id: 's1', content: { title: 'Welcome, {{firstName}}', body: 'On the {{plan|free}} plan.' } }],
      on: { NEXT: 'setup' },
    },
    setup: {
      label: 'Setup',
      steps: [{ id: 's2', content: { title: 'Configure' } }],
      final: true,
    },
  },
}

let gf: GuideFlowInstance | null = null

const popover = (): string => document.querySelector('.gf-popover')?.innerHTML ?? ''

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('content variables', () => {
  it('interpolates from the guidance context', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada', plan: 'pro' } })
    await gf.start(flow)

    expect(popover()).toContain('Welcome, Ada')
    expect(popover()).toContain('On the pro plan.')
  })

  it('falls back when the context has no value', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' } })
    await gf.start(flow)
    expect(popover()).toContain('On the free plan.')
  })

  it('reaches a custom renderer, already resolved', async () => {
    // The reason resolution lives in the engine: core never assumes the default
    // renderer, so a custom one must not have to know tokens exist.
    let seen: StepContent | null = null
    const renderer: RendererContract = {
      renderStep: (_s, content) => { seen = content },
      hideStep: () => {},
      renderHotspot: () => {},
      destroyHotspot: () => {},
      renderHint: () => {},
      destroyHints: () => {},
    }
    gf = createGuideFlow({ renderer, context: { userId: 'u', firstName: 'Ada' } })
    await gf.start(flow)

    expect((seen as StepContent | null)?.title).toBe('Welcome, Ada')
  })

  it('does not mutate the flow definition', async () => {
    // `step.content` is the author's object and is the same reference on every
    // render, so writing to it would bake the first user's values into the flow
    // permanently — and the second user would see the first user's name.
    const shared: FlowDefinition = JSON.parse(JSON.stringify(flow)) as FlowDefinition

    gf = createGuideFlow({ context: { userId: 'a', firstName: 'Ada' } })
    await gf.start(shared)
    expect(popover()).toContain('Welcome, Ada')
    gf.destroy()

    gf = createGuideFlow({ context: { userId: 'b', firstName: 'Grace' } })
    await gf.start(shared)
    expect(popover()).toContain('Welcome, Grace')
    expect(popover()).not.toContain('Ada')
  })

  it('escapes an interpolated value — the context is attacker-influenced', async () => {
    // GuidanceContext is routinely fed from URL parameters and CRM records.
    // Interpolation happens BEFORE the renderer, so every value still goes
    // through _esc and can only ever become visible characters.
    gf = createGuideFlow({ context: { userId: 'u', firstName: '<img src=x onerror=alert(1)>' } })
    await gf.start(flow)

    // Assert the DOM, never `innerHTML`. MEASURED: happy-dom does not re-escape
    // text nodes when it serialises — it parses `&lt;img&gt;` into a text node
    // correctly, then hands `innerHTML` back with the entities decoded. So an
    // `innerHTML` string check here tests happy-dom's serialiser rather than
    // this library, and reads as a vulnerability that is not there.
    expect(document.querySelector('.gf-popover img')).toBeNull()
    expect(document.querySelector('.gf-popover-title')?.textContent)
      .toBe('Welcome, <img src=x onerror=alert(1)>')
  })

  it('does NOT interpolate content.html — a token must never shape markup', async () => {
    // The rule, and it is a deliberate limitation rather than an oversight.
    //
    // "interpolate then sanitise" sounds safe, and for element content it is.
    // But in attribute context — `<a href="/r?next={{to}}">` — a value carrying
    // a quote closes the attribute BEFORE the sanitiser parses anything, so
    // untrusted data shapes the parse tree and every gap in the allowlist
    // becomes reachable from a URL parameter. And `sanitizeHTML` is opt-in, so
    // the exposed configuration would be the one a developer chose believing it
    // was the hardened one.
    //
    // The catalogue may still translate `html` — a translation file is the same
    // trust level as the flow file beside it. Only runtime values are refused.
    const sanitizeHTML = (h: string): string => h
    gf = createGuideFlow({ sanitizeHTML, context: { userId: 'u', bio: 'Ada' } })
    await gf.start({
      id: 'html-flow',
      initial: 'm',
      states: { m: { steps: [{ id: 'h1', content: { html: '<p>{{bio}}</p>' } }], final: true } },
    })

    expect(document.querySelector('.gf-popover-body')?.textContent).toBe('{{bio}}')
  })

  it('still lets the catalogue translate content.html', async () => {
    const sanitizeHTML = (h: string): string => h
    gf = createGuideFlow({ sanitizeHTML, context: { userId: 'u' } })
    gf.i18n.registerContent('es', { steps: { h1: { html: '<p>Hola</p>' } } })
    gf.i18n.use('es')
    await gf.start({
      id: 'html-flow-2',
      initial: 'm',
      states: { m: { steps: [{ id: 'h1', content: { html: '<p>Hello</p>' } }], final: true } },
    })

    expect(document.querySelector('.gf-popover-body')?.textContent).toBe('Hola')
  })
})

describe('content localisation', () => {
  it('overrides step copy for the active locale', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' } })
    gf.i18n.registerContent('es', { steps: { s1: { title: 'Bienvenido, {{firstName}}' } } })
    gf.i18n.use('es')
    await gf.start(flow)

    // The case that forces one pipeline: a translated string with a token in it.
    expect(popover()).toContain('Bienvenido, Ada')
  })

  it('falls through per field, so a partial translation degrades one string at a time', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada', plan: 'pro' } })
    gf.i18n.registerContent('es', { steps: { s1: { title: 'Bienvenido, {{firstName}}' } } })
    gf.i18n.use('es')
    await gf.start(flow)

    expect(popover()).toContain('Bienvenido, Ada')
    // body was not translated — the flow's own copy is the fallback.
    expect(popover()).toContain('On the pro plan.')
  })

  it('ignores a catalogue for a locale that is not active', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' } })
    gf.i18n.registerContent('es', { steps: { s1: { title: 'Bienvenido' } } })
    await gf.start(flow)
    expect(popover()).toContain('Welcome, Ada')
  })

  it('merges catalogues registered in pieces', async () => {
    // Flows are static assets, so one fetch per flow is a normal shape.
    gf = createGuideFlow({ context: { userId: 'u' } })
    gf.i18n.registerContent('es', { steps: { s1: { title: 'Uno' } } })
    gf.i18n.registerContent('es', { steps: { s2: { title: 'Dos' } } })
    gf.i18n.use('es')
    await gf.start(flow)

    expect(popover()).toContain('Uno')
    await gf.next()
    expect(popover()).toContain('Dos')
  })

  it('switches a live step on rerender()', async () => {
    // `use()` alone changes the next render, matching the chrome strings.
    // `rerender()` is the documented one-liner for switching what is on screen.
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' } })
    gf.i18n.registerContent('es', { steps: { s1: { title: 'Bienvenido, {{firstName}}' } } })
    await gf.start(flow)
    expect(popover()).toContain('Welcome, Ada')

    gf.i18n.use('es')
    await gf.rerender()
    expect(popover()).toContain('Bienvenido, Ada')
  })
})

describe('chapters', () => {
  it('renders the current state label', async () => {
    gf = createGuideFlow({ context: { userId: 'u' } })
    await gf.start(flow)
    expect(document.querySelector('.gf-popover-chapter')?.textContent).toBe('Getting started')
  })

  it('changes when the tour crosses into another state', async () => {
    gf = createGuideFlow({ context: { userId: 'u' } })
    await gf.start(flow)
    await gf.next()
    expect(document.querySelector('.gf-popover-chapter')?.textContent).toBe('Setup')
  })

  it('renders nothing when a state has no label', async () => {
    gf = createGuideFlow({ context: { userId: 'u' } })
    await gf.start({
      id: 'unlabelled',
      initial: 'm',
      states: { m: { steps: [{ id: 'x', content: { title: 'X' } }], final: true } },
    })
    expect(document.querySelector('.gf-popover-chapter')).toBeNull()
  })

  it('is translatable — which is why it ships with the catalogue', async () => {
    // A hardcoded English chapter label would be the one untranslatable string
    // in an otherwise fully translatable flow file.
    gf = createGuideFlow({ context: { userId: 'u' } })
    gf.i18n.registerContent('es', { states: { intro: 'Primeros pasos' } })
    gf.i18n.use('es')
    await gf.start(flow)

    expect(document.querySelector('.gf-popover-chapter')?.textContent).toBe('Primeros pasos')
  })

  it('reaches a custom renderer as the fifth argument', async () => {
    let seen: string | undefined
    const renderer: RendererContract = {
      renderStep: (_s, _c, _i, _t, chapter) => { seen = chapter },
      hideStep: () => {},
      renderHotspot: () => {},
      destroyHotspot: () => {},
      renderHint: () => {},
      destroyHints: () => {},
    }
    gf = createGuideFlow({ renderer, context: { userId: 'u' } })
    await gf.start(flow)
    expect(seen).toBe('Getting started')
  })

  it('escapes a chapter label', async () => {
    gf = createGuideFlow({ context: { userId: 'u' } })
    await gf.start({
      id: 'evil-chapter',
      initial: 'm',
      states: {
        m: {
          label: '<img src=x onerror=alert(1)>',
          steps: [{ id: 'x', content: { title: 'X' } }],
          final: true,
        },
      },
    })
    expect(document.querySelector('.gf-popover img')).toBeNull()
  })
})
