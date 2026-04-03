// ---------------------------------------------------------------------------
// Hotspot Engine
// Persistent pulsing beacon on elements with tooltip on hover/focus
// Non-blocking — no overlay, no flow interruption
// ---------------------------------------------------------------------------

import type { HotspotOptions, RegisteredHotspot, TourEvents } from '../types/index.js'
import { EventEmitter } from '../utils/emitter.js'
import { injectStyles } from '../utils/styles.js'
import { isBrowser } from '../utils/ssr.js'

const HOTSPOT_CSS_ID = 'gf-hotspot'
const HOTSPOT_CSS = `
@keyframes gf-pulse {
  0%   { transform: scale(1);   opacity: 1;   }
  50%  { transform: scale(2);   opacity: 0.4; }
  100% { transform: scale(1);   opacity: 1;   }
}
.gf-hotspot {
  position: absolute;
  z-index: 99997;
  pointer-events: all;
  cursor: pointer;
}
.gf-hotspot-beacon {
  width: var(--gf-hotspot-size, 12px);
  height: var(--gf-hotspot-size, 12px);
  border-radius: 50%;
  background: var(--gf-accent-color, #6366f1);
  animation: gf-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  display: block;
}
.gf-hotspot-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 8px);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  max-width: 240px;
  white-space: normal;
  box-shadow: var(--gf-shadow, 0 4px 20px rgba(0,0,0,0.15));
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  z-index: 99998;
}
.gf-hotspot:hover .gf-hotspot-tooltip,
.gf-hotspot:focus-within .gf-hotspot-tooltip {
  opacity: 1;
}
`

let _hotspotCounter = 0

export class HotspotManager extends EventEmitter<Pick<TourEvents, 'hotspot:open' | 'hotspot:close'>> {
  private _hotspots = new Map<string, RegisteredHotspot>()
  private _cleanups = new Map<string, () => void>()
  private _nonce: string | undefined

  constructor(nonce?: string) {
    super()
    this._nonce = nonce
  }

  // ── Public API ────────────────────────────────────────────────────────────

  add(target: string | Element, options: HotspotOptions = {}): string {
    if (!isBrowser()) return ''

    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) {
      console.warn('[GuideFlow] Hotspot target not found:', target)
      return ''
    }

    injectStyles(HOTSPOT_CSS, HOTSPOT_CSS_ID, this._nonce)

    const id = `gf-hotspot-${++_hotspotCounter}`
    const beacon = this._createBeacon(id, options)
    const tooltip = this._createTooltip(options)

    beacon.appendChild(tooltip)

    // Position the beacon relative to the target
    this._positionBeacon(beacon, el)

    document.body.appendChild(beacon)

    const registered: RegisteredHotspot = {
      id,
      target: el,
      options,
      beaconEl: beacon,
      tooltipEl: tooltip,
    }

    beacon.addEventListener('click', () => this.emit('hotspot:open', { id }))
    beacon.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.emit('hotspot:open', { id })
      }
    })

    this._hotspots.set(id, registered)

    // Keep position synced on scroll/resize
    const update = () => this._positionBeacon(beacon, el)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })

    this._cleanups.set(id, () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    })

    return id
  }

  remove(id: string): void {
    const hotspot = this._hotspots.get(id)
    if (!hotspot) return
    // Clean up scroll/resize listeners before removing DOM
    this._cleanups.get(id)?.()
    this._cleanups.delete(id)
    hotspot.beaconEl.parentNode?.removeChild(hotspot.beaconEl)
    this._hotspots.delete(id)
  }

  removeAll(): void {
    this._hotspots.forEach((_, id) => this.remove(id))
  }

  get(id: string): RegisteredHotspot | undefined {
    return this._hotspots.get(id)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _createBeacon(id: string, options: HotspotOptions): HTMLElement {
    const container = document.createElement('div')
    container.className = 'gf-hotspot'
    container.setAttribute('role', 'button')
    container.setAttribute('tabindex', '0')
    container.setAttribute('aria-label', options.title ?? 'Guidance hint')
    container.setAttribute('data-gf-hotspot-id', id)

    const beaconDot = document.createElement('span')
    beaconDot.className = 'gf-hotspot-beacon'
    if (options.color) {
      beaconDot.style.background = options.color
    }
    if (options.size) {
      beaconDot.style.width = `${options.size}px`
      beaconDot.style.height = `${options.size}px`
    }
    container.appendChild(beaconDot)

    return container
  }

  private _createTooltip(options: HotspotOptions): HTMLElement {
    const tooltip = document.createElement('div')
    tooltip.className = 'gf-hotspot-tooltip'
    tooltip.setAttribute('role', 'tooltip')

    if (options.title) {
      const title = document.createElement('strong')
      title.textContent = options.title
      tooltip.appendChild(title)
    }
    if (options.body) {
      const body = document.createElement('p')
      body.style.margin = '4px 0 0'
      body.textContent = options.body
      tooltip.appendChild(body)
    }

    return tooltip
  }

  private _positionBeacon(beacon: HTMLElement, target: Element): void {
    const rect = target.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    beacon.style.position = 'absolute'
    beacon.style.left = `${rect.right + scrollX - 6}px`
    beacon.style.top = `${rect.top + scrollY - 6}px`
  }
}
