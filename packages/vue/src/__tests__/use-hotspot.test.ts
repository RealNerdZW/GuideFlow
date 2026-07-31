// ---------------------------------------------------------------------------
// @guideflow/vue — useHotspot composable
//
// Hotspots are real DOM: core appends a `.gf-hotspot` beacon to document.body
// and tags it `data-gf-hotspot-id`. happy-dom is enough to assert creation,
// re-creation and removal — nothing here depends on layout.
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'

import { useHotspot, type UseHotspotReturn } from '../composables/use-hotspot.js'
import { GuideFlowPlugin } from '../plugin.js'

let gf: GuideFlowInstance

beforeEach(() => {
  gf = createGuideFlow()
})

afterEach(() => {
  gf.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function beacons(): NodeListOf<Element> {
  return document.querySelectorAll('[data-gf-hotspot-id]')
}

interface Harness {
  api: UseHotspotReturn
  el: Ref<HTMLElement | null>
  unmount: () => void
}

/**
 * Mount a component whose template ref is the hotspot target.
 *
 * The watcher is `flush: 'post'`, so the beacon appears on the tick after
 * mount — the same timing as a React effect, and late enough that the target
 * is really in the document when core measures it.
 */
async function mountWithRef(): Promise<Harness> {
  const captured: { api: UseHotspotReturn | null; el: Ref<HTMLElement | null> | null } = {
    api: null,
    el: null,
  }

  const wrapper = mount(
    defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null)
        captured.el = el
        captured.api = useHotspot(el, { title: 'New', body: 'Try this' })
        return () => h('button', { ref: el }, 'Export')
      },
    }),
    {
      global: { plugins: [[GuideFlowPlugin, { instance: gf }]] },
      attachTo: document.body,
    },
  )

  await nextTick()

  if (!captured.api || !captured.el) throw new Error('useHotspot() did not run in setup()')
  return { api: captured.api, el: captured.el, unmount: () => wrapper.unmount() }
}

describe('useHotspot with a template ref', () => {
  it('creates the beacon once the element is mounted', async () => {
    const { api } = await mountWithRef()

    expect(beacons()).toHaveLength(1)
    expect(api.id.value).not.toBeNull()
    expect(document.querySelector(`[data-gf-hotspot-id="${api.id.value ?? ''}"]`)).not.toBeNull()
  })

  it('removes the beacon when the component unmounts', async () => {
    const { api, unmount } = await mountWithRef()
    expect(beacons()).toHaveLength(1)

    unmount()

    expect(beacons()).toHaveLength(0)
    expect(api.id.value).toBeNull()
  })

  it('re-creates the beacon when the target ref changes', async () => {
    const { api, el } = await mountWithRef()
    const first = api.id.value
    expect(first).not.toBeNull()

    const replacement = document.createElement('div')
    document.body.appendChild(replacement)
    el.value = replacement
    await nextTick()

    expect(beacons()).toHaveLength(1)
    expect(api.id.value).not.toBe(first)
  })

  it('removes the beacon when the ref goes back to null', async () => {
    const { api, el } = await mountWithRef()

    el.value = null
    await nextTick()

    expect(beacons()).toHaveLength(0)
    expect(api.id.value).toBeNull()
  })

  it('remove() is idempotent and safe before the teardown runs', async () => {
    const { api, unmount } = await mountWithRef()

    api.remove()
    expect(beacons()).toHaveLength(0)

    api.remove()
    expect(() => unmount()).not.toThrow()
    expect(beacons()).toHaveLength(0)
  })
})

describe('useHotspot with a selector', () => {
  it('attaches after a tick, once the template has rendered', async () => {
    const captured: { api: UseHotspotReturn | null } = { api: null }

    const wrapper = mount(
      defineComponent({
        setup() {
          captured.api = useHotspot('#deferred-target')
          return () => h('button', { id: 'deferred-target' }, 'Export')
        },
      }),
      {
        global: { plugins: [[GuideFlowPlugin, { instance: gf }]] },
        attachTo: document.body,
      },
    )

    await nextTick()

    expect(beacons()).toHaveLength(1)
    expect(captured.api?.id.value).not.toBeNull()

    wrapper.unmount()
    expect(beacons()).toHaveLength(0)
  })

  it('reports a null id when the selector matches nothing', async () => {
    // core warns and returns '' rather than throwing.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const captured: { api: UseHotspotReturn | null } = { api: null }

    mount(
      defineComponent({
        setup() {
          captured.api = useHotspot('#nothing-here')
          return () => h('div')
        },
      }),
      { global: { plugins: [[GuideFlowPlugin, { instance: gf }]] } },
    )

    await nextTick()

    expect(captured.api?.id.value).toBeNull()
    expect(beacons()).toHaveLength(0)
  })

  it('does not attach when the scope is disposed before the tick lands', async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          useHotspot('#late-target')
          return () => h('button', { id: 'late-target' })
        },
      }),
      {
        global: { plugins: [[GuideFlowPlugin, { instance: gf }]] },
        attachTo: document.body,
      },
    )

    wrapper.unmount()
    await nextTick()

    expect(beacons()).toHaveLength(0)
  })
})
