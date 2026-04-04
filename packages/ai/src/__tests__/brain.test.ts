/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { Step } from '@guideflow/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { GuideBrain } from '../brain.js'
import type { AIProvider } from '../providers/interface.js'
import { MockProvider } from '../providers/mock.js'

// Minimal mock for GuideFlowInstance used by compress()
function createMockInstance() {
  return {
    progress: {
      isCompleted: vi.fn().mockResolvedValue(false),
    },
    destroy: vi.fn(),
  }
}

describe('GuideBrain', () => {
  let brain: GuideBrain
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider(0) // no delay for tests
    brain = new GuideBrain(provider, { intentDebounceMs: 50, maxEventBuffer: 10 })
  })

  afterEach(() => {
    brain.destroy()
  })

  describe('generate()', () => {
    it('returns steps from provider', async () => {
      const steps = await brain.generate('Walk me through checkout')
      expect(Array.isArray(steps)).toBe(true)
    })

    it('emits steps:generated event', async () => {
      const handler = vi.fn()
      brain.on('steps:generated', handler)
      await brain.generate('test prompt')
      expect(handler).toHaveBeenCalledTimes(1)
      expect(Array.isArray(handler.mock.calls[0]![0])).toBe(true)
    })

    it('emits error and throws when provider fails', async () => {
      const failProvider: AIProvider = {
        generateSteps: vi.fn().mockRejectedValue(new Error('API down')),
        detectIntent: vi.fn(),
        answerQuestion: vi.fn(),
      }
      const failBrain = new GuideBrain(failProvider)
      const errorHandler = vi.fn()
      failBrain.on('error', errorHandler)

      await expect(failBrain.generate('test')).rejects.toThrow('API down')
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error))
      failBrain.destroy()
    })
  })

  describe('chat()', () => {
    it('returns a GuidedAnswer', async () => {
      const answer = await brain.chat('How do I add a promo code?')
      expect(typeof answer.text).toBe('string')
      expect(Array.isArray(answer.highlights)).toBe(true)
    })

    it('emits answer:ready event', async () => {
      const handler = vi.fn()
      brain.on('answer:ready', handler)
      await brain.chat('question')
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('detectIntent()', () => {
    it('returns an IntentSignal', async () => {
      const signal = await brain.detectIntent()
      expect(signal).toHaveProperty('type')
      expect(signal).toHaveProperty('confidence')
    })

    it('emits intent:detected event', async () => {
      const handler = vi.fn()
      brain.on('intent:detected', handler)
      await brain.detectIntent()
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('on() / event system', () => {
    it('returns an unsubscribe function', async () => {
      const handler = vi.fn()
      const unsub = brain.on('steps:generated', handler)
      await brain.generate('test')
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()
      await brain.generate('test2')
      expect(handler).toHaveBeenCalledTimes(1) // still 1
    })
  })

  describe('clearBuffer()', () => {
    it('clears the event buffer without error', () => {
      brain.clearBuffer()
      // No throw = success
    })
  })

  describe('destroy()', () => {
    it('clears listeners and timers', () => {
      const handler = vi.fn()
      brain.on('error', handler)
      brain.destroy()
      // After destroy, listeners should be gone
      // (internal map cleared)
    })
  })

  describe('compress()', () => {
    it('returns steps when no filtering applies', async () => {
      const steps: Step[] = [
        { id: 'step-1', content: { title: 'Step 1' } },
        { id: 'step-2', content: { title: 'Step 2' } },
      ]
      const instance = createMockInstance()
      const result = await brain.compress(steps, instance as any)
      // MockProvider returns exploring with 0.75 confidence
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('returns original steps when provider errors', async () => {
      const failProvider: AIProvider = {
        generateSteps: vi.fn(),
        detectIntent: vi.fn().mockRejectedValue(new Error('fail')),
        answerQuestion: vi.fn(),
      }
      const failBrain = new GuideBrain(failProvider)
      const steps: Step[] = [{ id: 's1', content: { title: 'S1' } }]
      const result = await failBrain.compress(steps, createMockInstance() as any)
      expect(result).toEqual(steps)
      failBrain.destroy()
    })
  })
})
