import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { AnalyticsEvent } from '../transports/interface.js'
import { WebhookTransport } from '../transports/webhook.js'

function makeEvent(name = 'guideflow.tour.started'): AnalyticsEvent {
  return {
    event: name,
    timestamp: new Date().toISOString(),
    properties: { flow_id: 'test' },
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
describe('WebhookTransport', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.useRealTimers()
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
    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = call[1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer secret')
    transport.destroy()
  })

  it('sends JSON body with batch of events', async () => {
    const transport = new WebhookTransport({ url: 'https://example.com' })
    transport.track(makeEvent('event-1'))
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const call = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as AnalyticsEvent[]
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

  it('flushes queued events on beforeunload', async () => {
    // The last batch of a session is the one that says how the tour ended. With
    // a batch interval set, nothing else sends it before the tab goes away.
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60_000,
      maxQueueSize: 50,
    })
    transport.track(makeEvent('last-event'))
    expect(fetchSpy).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('beforeunload'))

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as AnalyticsEvent[]
    expect(body[0]!.event).toBe('last-event')

    transport.destroy()
  })

  it('destroy() removes the beforeunload listener', async () => {
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60_000,
      maxQueueSize: 50,
    })
    transport.destroy()
    fetchSpy.mockClear()

    transport.track(makeEvent('orphan'))
    window.dispatchEvent(new Event('beforeunload'))
    await new Promise((r) => setTimeout(r, 20))

    // A destroyed transport that still answered beforeunload would resurrect
    // itself on every page the host ever navigates away from.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('flushes on the batch interval without being tracked into', async () => {
    // The whole point of batchIntervalMs: an event sits in the queue and the
    // timer, not the next track(), is what sends it. Without this the interval
    // callback never runs in any test and a broken timer looks green.
    vi.useFakeTimers()
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 1000,
      maxQueueSize: 50,
    })
    transport.track(makeEvent('e1'))
    expect(fetchSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as AnalyticsEvent[]
    expect(body[0]!.event).toBe('e1')

    transport.destroy()
  })

  it('stops flushing on the interval once destroyed', async () => {
    vi.useFakeTimers()
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 1000,
      maxQueueSize: 50,
    })
    transport.destroy()
    transport.track(makeEvent('after-destroy'))
    // track() with a non-zero interval only queues, and the timer is gone.
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats a non-2xx response as a failure and keeps the batch', async () => {
    // `fetch` resolves for a 500 — only a network error rejects. Without the
    // `response.ok` check the batch would be dropped and counted as delivered.
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 })
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60_000,
      maxQueueSize: 50,
    })
    transport.track(makeEvent('e1'))

    await transport.flush()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await transport.flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const retried = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string) as AnalyticsEvent[]
    expect(retried[0]!.event).toBe('e1')

    transport.destroy()
  })

  it('drops the batch and warns once the retry budget is exhausted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    fetchSpy.mockRejectedValue(new Error('Network error'))
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60_000,
      maxQueueSize: 50,
      maxRetries: 2,
    })
    transport.track(makeEvent('e1'))

    await transport.flush() // failure 1 — re-queued
    expect(warn).not.toHaveBeenCalled()
    await transport.flush() // failure 2 — budget spent, batch dropped
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('dropping 1 event(s)')

    // Dropped means gone: a later successful flush has nothing left to send.
    fetchSpy.mockResolvedValue({ ok: true })
    await transport.flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    transport.destroy()
  })

  it('resets the failure count after a success, so the budget is consecutive', async () => {
    // A count that never reset would drop a batch after N failures spread over
    // an entire session, however many successes sat between them.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const transport = new WebhookTransport({
      url: 'https://example.com',
      batchIntervalMs: 60_000,
      maxQueueSize: 50,
      maxRetries: 2,
    })

    fetchSpy.mockRejectedValueOnce(new Error('Network error'))
    transport.track(makeEvent('e1'))
    await transport.flush() // failure 1
    await transport.flush() // succeeds — counter back to 0

    fetchSpy.mockRejectedValueOnce(new Error('Network error'))
    transport.track(makeEvent('e2'))
    await transport.flush() // failure 1 again, not 2 — so nothing is dropped
    expect(warn).not.toHaveBeenCalled()

    await transport.flush()
    const last = JSON.parse(
      (fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit])[1].body as string,
    ) as AnalyticsEvent[]
    expect(last[0]!.event).toBe('e2')

    transport.destroy()
  })
})
