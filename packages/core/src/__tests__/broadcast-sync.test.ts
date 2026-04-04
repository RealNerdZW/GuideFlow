/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

import { BroadcastSync } from '../persistence/broadcast-sync.js'

// happy-dom may not support BroadcastChannel, so we mock it
const mockPostMessage = vi.fn()
const mockClose = vi.fn()
const mockAddEventListener = vi.fn()

class MockBroadcastChannel {
  name: string
  constructor(name: string) {
    this.name = name
  }
  postMessage = mockPostMessage
  close = mockClose
  addEventListener = mockAddEventListener
}

beforeEach(() => {
  // @ts-expect-error — polyfilling BroadcastChannel for test
  globalThis.BroadcastChannel = MockBroadcastChannel
})

afterEach(() => {
  vi.restoreAllMocks()
  mockPostMessage.mockReset()
  mockClose.mockReset()
  mockAddEventListener.mockReset()
})

describe('BroadcastSync', () => {
  it('creates a BroadcastChannel on construction', () => {
    const sync = new BroadcastSync('user-1')
    expect(sync).toBeDefined()
    sync.destroy()
  })

  it('broadcasts messages with userId', () => {
    const sync = new BroadcastSync('user-1')
    sync.broadcast({
      type: 'snapshot',
      flowId: 'tour-1',
      snapshot: {
        flowId: 'tour-1',
        currentState: 'step-1',
        stepIndex: 0,
        completed: false,
        timestamp: Date.now(),
      },
    })
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'snapshot',
        flowId: 'tour-1',
      }),
    )
    sync.destroy()
  })

  it('destroy() closes the channel', () => {
    const sync = new BroadcastSync('user-1')
    sync.destroy()
    expect(mockClose).toHaveBeenCalled()
  })

  it('destroy() clears all listeners', () => {
    const sync = new BroadcastSync('user-1')
    let called = false
    sync.on('progress:sync', () => { called = true })
    sync.destroy()
    // After destroy, listeners should be cleared
    sync.emit('progress:sync', { snapshot: {} as any })
    expect(called).toBe(false)
  })
})
