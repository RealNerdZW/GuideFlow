import { describe, it, expect } from 'vitest'
import { EventEmitter } from '../utils/emitter.js'

describe('EventEmitter', () => {
  it('registers and fires listeners', () => {
    const emitter = new EventEmitter<{ test: string }>()
    let received = ''
    emitter.on('test', (val) => { received = val })
    emitter.emit('test', 'hello')
    expect(received).toBe('hello')
  })

  it('returns an unsubscribe function from on()', () => {
    const emitter = new EventEmitter<{ test: number }>()
    let count = 0
    const off = emitter.on('test', () => { count++ })
    emitter.emit('test', 1)
    expect(count).toBe(1)
    off()
    emitter.emit('test', 2)
    expect(count).toBe(1)
  })

  it('fires once() listener only once', () => {
    const emitter = new EventEmitter<{ ping: string }>()
    let count = 0
    emitter.once('ping', () => { count++ })
    emitter.emit('ping', 'a')
    emitter.emit('ping', 'b')
    expect(count).toBe(1)
  })

  it('off() removes a specific listener', () => {
    const emitter = new EventEmitter<{ test: number }>()
    let count = 0
    const listener = () => { count++ }
    emitter.on('test', listener)
    emitter.emit('test', 1)
    emitter.off('test', listener)
    emitter.emit('test', 2)
    expect(count).toBe(1)
  })

  it('removeAllListeners() clears all listeners', () => {
    const emitter = new EventEmitter<{ a: number; b: string }>()
    let countA = 0
    let countB = 0
    emitter.on('a', () => { countA++ })
    emitter.on('b', () => { countB++ })
    emitter.removeAllListeners()
    emitter.emit('a', 1)
    emitter.emit('b', 'x')
    expect(countA).toBe(0)
    expect(countB).toBe(0)
  })

  it('removeAllListeners(event) clears only that event', () => {
    const emitter = new EventEmitter<{ a: number; b: string }>()
    let countA = 0
    let countB = 0
    emitter.on('a', () => { countA++ })
    emitter.on('b', () => { countB++ })
    emitter.removeAllListeners('a')
    emitter.emit('a', 1)
    emitter.emit('b', 'x')
    expect(countA).toBe(0)
    expect(countB).toBe(1)
  })

  it('supports multiple listeners on the same event', () => {
    const emitter = new EventEmitter<{ test: number }>()
    const results: number[] = []
    emitter.on('test', (v) => results.push(v * 2))
    emitter.on('test', (v) => results.push(v * 3))
    emitter.emit('test', 5)
    expect(results).toEqual([10, 15])
  })

  it('does not throw when emitting with no listeners', () => {
    const emitter = new EventEmitter<{ test: string }>()
    expect(() => emitter.emit('test', 'nothing')).not.toThrow()
  })
})
