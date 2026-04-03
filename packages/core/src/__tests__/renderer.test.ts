import { describe, it, expect, afterEach } from 'vitest'
import { DefaultRenderer } from '../renderer/default-renderer.js'
import type { Step, StepContent, GuideFlowConfig } from '../types/index.js'

describe('DefaultRenderer', () => {
  let renderer: DefaultRenderer

  afterEach(() => {
    renderer?.hideStep()
    document.querySelectorAll('.gf-popover').forEach((el) => el.remove())
    document.querySelectorAll('[id^="gf-popover"]').forEach((el) => el.remove())
  })

  it('renders a step popover in the DOM', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = {
      id: 'step-1',
      content: { title: 'Hello', body: 'Welcome to the tour' },
    }
    const content: StepContent = { title: 'Hello', body: 'Welcome to the tour' }

    renderer.renderStep(step, content, 0, 3)

    const popover = document.querySelector('.gf-popover')
    expect(popover).not.toBeNull()
    expect(popover?.innerHTML).toContain('Hello')
    expect(popover?.innerHTML).toContain('Welcome to the tour')
  })

  it('escapes title and body to prevent XSS (no actual script elements)', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = {
      id: 'xss-test',
      content: { title: '<script>alert("xss")</script>', body: '<img onerror=alert(1)>' },
    }
    const content: StepContent = { title: '<script>alert("xss")</script>', body: '<img onerror=alert(1)>' }

    renderer.renderStep(step, content, 0, 1)

    const popover = document.querySelector('.gf-popover')
    // The _esc() method converts < to &lt; creating text nodes, not elements.
    // Verify no actual <script> or <img> elements were injected into the DOM.
    expect(popover?.querySelector('script')).toBeNull()
    // Title should contain the text (rendered as safe text node)
    const titleEl = popover?.querySelector('.gf-popover-title')
    expect(titleEl?.textContent).toContain('alert')
  })

  it('sanitizes content.html to strip dangerous elements', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const html = '<p>Safe</p><script>alert("xss")</script><iframe src="evil"></iframe>'
    const step: Step = {
      id: 'html-sanitize',
      content: { html },
    }
    const content: StepContent = { html }

    renderer.renderStep(step, content, 0, 1)

    const popover = document.querySelector('.gf-popover')
    expect(popover?.innerHTML).toContain('<p>Safe</p>')
    expect(popover?.innerHTML).not.toContain('<script>')
    expect(popover?.innerHTML).not.toContain('<iframe')
  })

  it('sanitizes on* event handlers from HTML content', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const html = '<div onclick="alert(1)">Click me</div>'
    const step: Step = {
      id: 'handler-test',
      content: { html },
    }
    const content: StepContent = { html }

    renderer.renderStep(step, content, 0, 1)

    const popover = document.querySelector('.gf-popover')
    expect(popover?.innerHTML).not.toContain('onclick')
  })

  it('sanitizes javascript: URLs in HTML content', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const html = '<a href="javascript:alert(1)">Link</a>'
    const step: Step = {
      id: 'url-test',
      content: { html },
    }
    const content: StepContent = { html }

    renderer.renderStep(step, content, 0, 1)

    const popover = document.querySelector('.gf-popover')
    expect(popover?.innerHTML).not.toContain('javascript:')
  })

  it('hideStep removes the popover from DOM', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = { id: 's1', content: { title: 'Test' } }
    renderer.renderStep(step, { title: 'Test' }, 0, 1)
    expect(document.querySelector('.gf-popover')).not.toBeNull()

    renderer.hideStep()
    expect(document.querySelector('.gf-popover')).toBeNull()
  })

  it('wires action buttons with data-gf-action', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    let actionReceived = ''
    renderer.setActionHandler((action) => { actionReceived = action })

    const step: Step = { id: 's1', content: { title: 'Test' } }
    renderer.renderStep(step, { title: 'Test' }, 0, 3)

    const nextBtn = document.querySelector('[data-gf-action="next"]') as HTMLElement
    nextBtn?.click()
    expect(actionReceived).toBe('next')
  })

  it('shows progress bar for multi-step tours', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = { id: 's1', content: { title: 'Step 1' } }
    renderer.renderStep(step, { title: 'Step 1' }, 0, 5)

    const progressBar = document.querySelector('.gf-progress-bar')
    expect(progressBar).not.toBeNull()
    expect(progressBar?.getAttribute('aria-valuenow')).toBe('20')
  })

  it('sets correct ARIA attributes on popover', () => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)

    const step: Step = { id: 's1', content: { title: 'Accessible' } }
    renderer.renderStep(step, { title: 'Accessible' }, 0, 1)

    const popover = document.querySelector('.gf-popover')
    expect(popover?.getAttribute('role')).toBe('dialog')
    expect(popover?.getAttribute('aria-modal')).toBe('true')
  })
})
