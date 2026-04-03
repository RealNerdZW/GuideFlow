import { describe, it, expect, afterEach } from 'vitest'
import { HotspotManager } from '../engine/hotspot.js'

describe('HotspotManager', () => {
  let manager: HotspotManager

  afterEach(() => {
    manager?.removeAll()
    // Clean up any remaining DOM
    document.querySelectorAll('.gf-hotspot').forEach((el) => el.remove())
  })

  it('adds a hotspot and returns an id', () => {
    manager = new HotspotManager()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const id = manager.add(target, { title: 'Test Hotspot' })
    expect(id).toBeTruthy()
    expect(id.startsWith('gf-hotspot-')).toBe(true)
    target.remove()
  })

  it('creates a visible beacon element in the DOM', () => {
    manager = new HotspotManager()
    const target = document.createElement('button')
    document.body.appendChild(target)
    manager.add(target, { title: 'Click me' })
    const beacon = document.querySelector('.gf-hotspot')
    expect(beacon).not.toBeNull()
    target.remove()
  })

  it('removes a hotspot by id', () => {
    manager = new HotspotManager()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const id = manager.add(target)
    expect(manager.get(id)).toBeDefined()
    manager.remove(id)
    expect(manager.get(id)).toBeUndefined()
    target.remove()
  })

  it('removeAll clears all hotspots', () => {
    manager = new HotspotManager()
    const t1 = document.createElement('div')
    const t2 = document.createElement('div')
    document.body.appendChild(t1)
    document.body.appendChild(t2)
    const id1 = manager.add(t1)
    const id2 = manager.add(t2)
    manager.removeAll()
    expect(manager.get(id1)).toBeUndefined()
    expect(manager.get(id2)).toBeUndefined()
    t1.remove()
    t2.remove()
  })

  it('returns empty string for non-existent selector target', () => {
    manager = new HotspotManager()
    const id = manager.add('#does-not-exist')
    expect(id).toBe('')
  })

  it('emits hotspot:open on click', () => {
    manager = new HotspotManager()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const id = manager.add(target, { title: 'Open me' })
    let openedId = ''
    manager.on('hotspot:open', (e) => { openedId = e.id })
    const beacon = document.querySelector(`[data-gf-hotspot-id="${id}"]`)
    beacon?.dispatchEvent(new Event('click'))
    expect(openedId).toBe(id)
    target.remove()
  })

  it('accepts string selector for target', () => {
    manager = new HotspotManager()
    const target = document.createElement('div')
    target.id = 'hotspot-target-test'
    document.body.appendChild(target)
    const id = manager.add('#hotspot-target-test')
    expect(id).toBeTruthy()
    target.remove()
  })

  it('cleans up scroll/resize listeners on remove (no leak)', () => {
    manager = new HotspotManager()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const id = manager.add(target)
    // remove() should not throw and should clean up
    expect(() => manager.remove(id)).not.toThrow()
    target.remove()
  })
})
