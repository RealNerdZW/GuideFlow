// ---------------------------------------------------------------------------
// Style injection utility
// Supports CSP nonce, optional de-duplication by id
// ---------------------------------------------------------------------------

import { isBrowser } from './ssr.js'

const injectedIds = new Set<string>()

export function injectStyles(css: string, id: string, nonce?: string): void {
  if (!isBrowser()) return
  if (injectedIds.has(id)) return

  const style = document.createElement('style')
  style.setAttribute('data-gf', id)
  if (nonce) style.setAttribute('nonce', nonce)
  style.textContent = css
  document.head.appendChild(style)
  injectedIds.add(id)
}

export function removeStyles(id: string): void {
  if (!isBrowser()) return
  document
    .querySelectorAll(`style[data-gf="${id}"]`)
    .forEach((el) => el.parentNode?.removeChild(el))
  injectedIds.delete(id)
}

/** Generate a unique DOM id for GuideFlow elements */
let _idCounter = 0
export function gfId(prefix = 'gf'): string {
  return `${prefix}-${++_idCounter}`
}
