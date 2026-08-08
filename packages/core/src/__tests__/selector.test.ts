// ---------------------------------------------------------------------------
// The selector engine, against the DOM shapes that actually break recorders.
//
// Two of these cases are REGRESSIONS: measured against real Chromium, the
// implementation this replaces resolved to the WRONG ELEMENT for both. They are
// marked and they are the reason this module exists.
//
// happy-dom has no layout engine, which is exactly why nothing in `selector.ts`
// reads geometry — every rule here is attribute- and structure-based, so it is
// honestly testable in this environment. The one thing happy-dom cannot prove
// is that a real browser agrees; apps/e2e/tests/selector.spec.ts does that.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest'

import { buildSelector, isStableId, retargetToInteractive, verifySelector } from '../selector.js'

function mount(html: string): void {
  document.body.innerHTML = html
}

const pick = (sel: string): Element => {
  const el = document.querySelector(sel)
  if (!el) throw new Error(`fixture selector missed: ${sel}`)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isStableId', () => {
  it('accepts ids a human wrote', () => {
    for (const id of ['save-button', 'main_nav', 'billing', 'step-one', 'sidebar-2', 'col-6']) {
      expect(isStableId(id), id).toBe(true)
    }
  })

  it('rejects framework-generated ids', () => {
    for (const id of [
      ':r1:', // React 18 useId
      ':R2ab:',
      '«r1»', // React 19
      'radix-:r3:',
      'headlessui-menu-button-1',
      'mui-1234',
      'downshift-0-input',
      '550e8400-e29b-41d4-a716-446655440000', // uuid
      'a1b2c3d4e5f6', // content hash
      'V1StGXR8_Z5jdHi6B-myT', // nanoid
      'row-38472', // db key
    ]) {
      expect(isStableId(id), id).toBe(false)
    }
  })

  it('rejects empty and absurdly long ids', () => {
    expect(isStableId('')).toBe(false)
    expect(isStableId('a'.repeat(65))).toBe(false)
  })
})

describe('verifySelector', () => {
  it('distinguishes unique, ambiguous, no-match and invalid', () => {
    mount('<button id="a">A</button><span class="x"></span><span class="x"></span>')
    const a = pick('#a')
    expect(verifySelector('#a', a)).toBe('unique')
    expect(verifySelector('.x', pick('.x'))).toBe('ambiguous')
    expect(verifySelector('#nope', a)).toBe('no-match')
    // A malformed candidate must demote, never propagate out of a recorder.
    expect(verifySelector(':::', a)).toBe('invalid')
  })

  it('rejects a unique selector that resolves to a different element', () => {
    // Not optional: after retargeting, a selector can be unique and still
    // describe the wrong element.
    mount('<button id="a">A</button><button id="b">B</button>')
    expect(verifySelector('#a', pick('#b'))).toBe('no-match')
  })
})

describe('retargetToInteractive', () => {
  it('climbs out of an icon to the button that owns it', () => {
    mount('<button id="save"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></button>')
    expect(retargetToInteractive(pick('path')).id).toBe('save')
  })

  it('leaves an already-interactive element alone', () => {
    mount('<button id="save">Save</button>')
    expect(retargetToInteractive(pick('#save')).id).toBe('save')
  })

  it('gives up rather than climbing to the body', () => {
    mount('<div><div><span id="x">text</span></div></div>')
    expect(retargetToInteractive(pick('#x')).id).toBe('x')
  })
})

describe('strategy ranking', () => {
  it('prefers data-gf-id above everything', () => {
    mount('<button data-gf-id="hero" data-testid="t" id="stable-id">x</button>')
    const r = buildSelector(pick('button'))
    expect(r.strategy).toBe('gf-id')
    expect(r.selector).toBe('[data-gf-id="hero"]')
    expect(r.confidence).toBe('stable')
  })

  it('prefers a test id over aria-label', () => {
    // The old order was the other way round. aria-label is user-visible text,
    // so it collides across a page and moves when the app is translated.
    mount('<button data-testid="save" aria-label="Save document">x</button>')
    const r = buildSelector(pick('button'))
    expect(r.strategy).toBe('testid')
    expect(r.selector).toBe('[data-testid="save"]')
  })

  it('uses a hand-written id', () => {
    mount('<button id="save-button">x</button>')
    expect(buildSelector(pick('button')).selector).toBe('#save-button')
  })

  it('uses a form control name', () => {
    mount('<form><input name="email" type="text"></form>')
    const r = buildSelector(pick('input'))
    expect(r.strategy).toBe('name')
    expect(r.selector).toBe('input[name="email"]')
  })

  it('scopes aria-label to the tag and flags it as translation-fragile', () => {
    mount('<button aria-label="Close">x</button>')
    const r = buildSelector(pick('button'))
    expect(r.selector).toBe('button[aria-label="Close"]')
    expect(r.warnings).toContain('i18n-fragile')
    expect(r.confidence).toBe('semantic')
  })

  it('uses a link href', () => {
    mount('<a href="/billing">Billing</a>')
    const r = buildSelector(pick('a'))
    expect(r.strategy).toBe('href')
    expect(r.selector).toBe('a[href="/billing"]')
  })
})

describe('generated ids are rejected, not trusted', () => {
  it('skips a React useId and says so', () => {
    mount('<div id="app"><button id=":r1:">Close</button></div>')
    const r = buildSelector(pick('button'))
    expect(r.strategy).not.toBe('id')
    expect(r.warnings).toContain('generated-id')
    expect(r.unique).toBe(true)
  })

  it('skips a Radix id', () => {
    mount('<div id="app"><button id="radix-:r3:">x</button></div>')
    expect(buildSelector(pick('button')).warnings).toContain('generated-id')
  })

  it('never emits a duplicated id, even though the DOM allows it', () => {
    // Three elements sharing an id is invalid HTML and entirely common.
    mount('<div><span id="dup">a</span><span id="dup">b</span><span id="dup">c</span></div>')
    const second = document.querySelectorAll('#dup')[1] as Element
    const r = buildSelector(second)
    expect(r.selector).not.toBe('#dup')
    expect(r.unique).toBe(true)
    expect(document.querySelectorAll(r.selector)).toHaveLength(1)
  })
})

describe('the two measured wrong-element regressions', () => {
  it('REGRESSION: two elements sharing aria-label resolve to the right one', () => {
    // Measured against real Chromium, the old engine emitted the bare
    // `[aria-label="Close"]` for both, matched 2, and pointed at the first.
    mount(`
      <div id="dialog"><button aria-label="Close">x</button></div>
      <div id="banner"><button aria-label="Close">x</button></div>
    `)
    const wanted = pick('#banner button')
    const r = buildSelector(wanted)
    expect(r.unique).toBe(true)
    expect(document.querySelector(r.selector)).toBe(wanted)
  })

  it('REGRESSION: a sidebar/main pair with matching nesting resolves correctly', () => {
    // Measured: the old 4-segment unanchored :nth-child chain produced
    // `div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > button:nth-child(1)`
    // for the MAIN button, matched 2, and pointed at SIDEBAR.
    mount(`
      <div class="page">
        <aside><div><div><div><button>SIDEBAR</button></div></div></div></aside>
        <main><div><div><div><button>MAIN</button></div></div></div></main>
      </div>
    `)
    const wanted = pick('main button')
    const r = buildSelector(wanted)
    expect(r.unique).toBe(true)
    expect(document.querySelector(r.selector)?.textContent).toBe('MAIN')
  })
})

describe('the anchored structural path', () => {
  it('roots the path on a stable anchor even when a shorter path is already unique', () => {
    // `li:nth-of-type(2) > span` is unique in this document TODAY, and stops
    // being unique the moment #other-panel grows a second row. Anchoring is
    // strictly more durable, so the walk keeps climbing to find one.
    mount(`
      <div id="settings-panel"><ul><li><span>a</span></li><li><span>b</span></li></ul></div>
      <div id="other-panel"><ul><li><span>a</span></li></ul></div>
    `)
    const wanted = document.querySelectorAll('#settings-panel span')[1] as Element
    const r = buildSelector(wanted)
    expect(r.selector.startsWith('#settings-panel')).toBe(true)
    expect(r.unique).toBe(true)
    expect(document.querySelector(r.selector)).toBe(wanted)

    // The durability claim, made concrete: grow the other panel and the
    // selector still resolves to the same element.
    const other = pick('#other-panel ul')
    other.appendChild(other.children[0]!.cloneNode(true))
    expect(document.querySelector(r.selector)).toBe(wanted)
  })

  it('falls back to the shortest unique path when no anchor exists', () => {
    mount('<div><ul><li><span>a</span></li><li><span>b</span></li></ul></div>')
    const wanted = document.querySelectorAll('span')[1] as Element
    const r = buildSelector(wanted)
    expect(r.unique).toBe(true)
    expect(document.querySelector(r.selector)).toBe(wanted)
  })

  it('disambiguates every row of two identical lists', () => {
    const row = '<li><span>Go</span></li>'
    mount(`<div><ul id="one">${row.repeat(6)}</ul><ul id="two">${row.repeat(6)}</ul></div>`)
    const spans = Array.from(document.querySelectorAll('span'))
    expect(spans).toHaveLength(12)
    for (const span of spans) {
      const r = buildSelector(span)
      expect(r.unique, r.selector).toBe(true)
      expect(document.querySelector(r.selector)).toBe(span)
    }
  })

  it('uses nth-of-type so an injected sibling does not shift the path', () => {
    // A portal, tooltip or overlay <div> appended as a sibling shifts every
    // nth-child index on the page. nth-of-type counts same-tag siblings only.
    mount('<section id="s"><p>one</p><p>two</p><p>three</p></section>')
    const wanted = document.querySelectorAll('p')[2] as Element
    const r = buildSelector(wanted)
    expect(r.selector).toContain(':nth-of-type(')
    expect(r.selector).not.toContain(':nth-child(')

    pick('#s').insertBefore(document.createElement('div'), pick('#s').firstChild)
    expect(document.querySelector(r.selector)).toBe(wanted)
  })

  it('marks a positional path fragile', () => {
    mount('<div><div><span>x</span></div></div>')
    const r = buildSelector(pick('span'))
    expect(r.confidence).toBe('fragile')
    expect(r.warnings).toContain('positional')
  })
})

describe('icons and SVG', () => {
  it('records the button, not the path inside it', () => {
    mount('<div id="bar"><button data-testid="save"><svg><path d="M0 0"/></svg></button></div>')
    const r = buildSelector(pick('path'))
    expect(r.warnings).toContain('retargeted')
    expect(r.element.localName).toBe('button')
    expect(r.selector).toBe('[data-testid="save"]')
  })

  it('never lowercases an SVG camelCase name into a selector', () => {
    mount('<div id="w"><svg><clipPath id="c"><rect/></clipPath></svg></div>')
    const r = buildSelector(pick('clipPath'))
    expect(r.selector).not.toContain('clippath')
  })
})

describe('privacy', () => {
  it('emits neither the id nor the test id from inside data-gf-private', () => {
    // The old code returned `#${el.id}` BEFORE consulting the privacy marker,
    // so both walked straight out of the opted-out subtree.
    mount('<form data-gf-private><input id="ssn" data-testid="ssn-field" name="ssn"></form>')
    const r = buildSelector(pick('input'))
    expect(r.warnings).toContain('redacted')
    expect(r.selector).not.toContain('ssn')
  })
})

describe('honest failure', () => {
  it('reports not-unique rather than inventing a selector', () => {
    // Two byte-identical subtrees with nothing to tell them apart, capped so
    // the walk cannot reach a distinguishing ancestor.
    mount('<div><span>x</span></div><div><span>x</span></div>')
    const wanted = document.querySelectorAll('span')[1] as Element
    const r = buildSelector(wanted, { maxDepth: 1 })
    expect(r.unique).toBe(false)
    expect(r.warnings).toContain('not-unique')
    expect(r.selector).not.toBe('')
  })

  it('always returns a non-empty selector', () => {
    mount('<div><em>x</em></div>')
    expect(buildSelector(pick('em')).selector.length).toBeGreaterThan(0)
  })
})

describe('escaping', () => {
  it('escapes a quote inside an attribute value', () => {
    mount('<button data-testid=\'say "hi"\'>x</button>')
    const r = buildSelector(pick('button'))
    expect(r.unique).toBe(true)
    expect(document.querySelector(r.selector)).toBe(pick('button'))
  })
})

describe('class churn does not matter', () => {
  it('survives a Tailwind or CSS-module rewrite, because no class strategy exists', () => {
    mount('<div id="card" class="md:flex w-1/2 !p-0 Card_root__a8f3x"><button id="go">Go</button></div>')
    const before = buildSelector(pick('#go')).selector
    pick('#card').className = 'Card_root__zzzzz flex p-4'
    expect(document.querySelector(before)?.id).toBe('go')
  })
})
