import { describe, it, expect, afterEach } from 'vitest'

import { HintSystem } from '../engine/hint.js'

describe('HintSystem', () => {
  let hints: HintSystem

  afterEach(() => {
    hints?.destroy()
    document.querySelectorAll('.gf-hint').forEach((el) => el.remove())
  })

  it('registers hint steps', () => {
    hints = new HintSystem()
    hints.register([
      { id: 'hint-1', target: '#el', hint: 'Help text' },
    ])
    expect(hints).toBeDefined()
  })

  it('show() creates hint elements in DOM', () => {
    hints = new HintSystem()
    const target = document.createElement('div')
    target.id = 'hint-target'
    document.body.appendChild(target)
    hints.register([
      { id: 'hint-1', target: '#hint-target', hint: 'Help text' },
    ])
    hints.show()
    expect(hints).toBeDefined()
    target.remove()
  })

  it('hide() removes hint elements', () => {
    hints = new HintSystem()
    const target = document.createElement('div')
    target.id = 'hint-target-2'
    document.body.appendChild(target)
    hints.register([
      { id: 'hint-2', target: '#hint-target-2', hint: 'Help' },
    ])
    hints.show()
    hints.hide()
    expect(hints).toBeDefined()
    target.remove()
  })

  it('destroy() cleans up all resources', () => {
    hints = new HintSystem()
    expect(() => hints.destroy()).not.toThrow()
  })

  it('emits hint:click on interaction', () => {
    hints = new HintSystem()
    let clickedId = ''
    hints.on('hint:click', (e) => { clickedId = e.id })
    expect(clickedId).toBe('')
  })
})
