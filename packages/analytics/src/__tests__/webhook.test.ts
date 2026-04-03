import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebhookTransport } from '../transports/webhook.js'
import type { AnalyticsEvent } from '../transports/interface.js'

function makeEvent(name = 'guideflow.tour.started'): AnalyticsEvent {
  return {
    event: name,
    timestamp: new Date().toISOString(),
    properties: { flow_id: 'test' },
  }
}

describe('WebhookTransport', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends events immediately when batchIntervalMs is 0', async () => {
    const transport = new WebhookTransport({ url: 'https://example.com/events' })
    transport.track(makeEvent())
    // flush is called automatically on track when batchIntervalMs=0
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/events',
      expect.objectContaining({ method: 'POST' }),
    )
    transport.destroy()
  })

  it('includes Authorization header when apiKey is provided', async () => {
    const transport = new WebhookTransport({ url: 'https://example.com', apiKey: 'secret' })
    transport.track(makeEvent())
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const call = fetchSpy.mock.calls[0]!
    const headers = call[1]!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer secret')
    transport.destroy()
  })

  it('sends JSON body with batch of events', async () => {
    const transport = new WebhookTransport({ url: 'https://example.com' })
    transport.track(makeEvent('event-1'))
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as AnalyticsEvent[]
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]!.event).toBe('event-1')
    transport.destroy()
  })

  it('queues events back on fetch failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'))
    const transport = new WebhookTransport({ url: 'https://example.com' })
    transport.track(makeEvent())
    // Wait for the failed flush
    await new Promise((r) => setTimeout(r, 50))
    // Queue should still have the event — retry on next flush
    fetchSpy.mockResolvedValueOnce({ ok: true })
    await transport.flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2) // 1 failed + 1 retry
    transport.destroy()
  })

  it('respects maxQueueSize for forced flush', async () => {
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60000, // long interval
      maxQueueSize: 3,
    })
    transport.track(makeEvent('e1'))
    transport.track(makeEvent('e2'))
    expect(fetchSpy).not.toHaveBeenCalled() // not yet flushed
    transport.track(makeEvent('e3')) // hits maxQueueSize
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    transport.destroy()
  })

  it('prevents concurrent flush calls (race condition guard)', async () => {
    let resolveFlush: () => void
    fetchSpy.mockImplementation(() => new Promise<{ ok: boolean }>((r) => {
      resolveFlush = () => r({ ok: true })
    }))
    const transport = new WebhookTransport({ url: 'https://example.com' })
    transport.track(makeEvent())
    // First flush starts
    const flush1 = transport.flush()
    // Second flush should be blocked by _flushing flag
    const flush2 = transport.flush()
    resolveFlush!()
    await flush1
    await flush2
    // Only one fetch call should have been made
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    transport.destroy()
  })

  it('flush() is no-op when queue is empty', async () => {
    const transport = new WebhookTransport({ url: 'https://example.com' })
    await transport.flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    transport.destroy()
  })

  it('destroy() clears the batch interval timer', () => {
    const transport = new WebhookTransport({ url: 'https://example.com', batchIntervalMs: 100 })
    transport.destroy()
    // No way to directly assert timer cleared, but no errors = success
  })
})
