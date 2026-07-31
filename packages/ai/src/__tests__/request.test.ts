// ---------------------------------------------------------------------------
// Timeouts, cancellation and retries.
//
// Regression cover for `provider-no-timeout-abort`: a grep for signal, timeout,
// AbortController and retry across this package used to return zero
// implementation hits outside ProxyProvider, so an unreachable Ollama host left
// generate() pending forever with no way to cancel it.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { withRetry, composeSignal, ProviderRequestError } from '../request.js';

describe('composeSignal', () => {
  it('returns the caller signal untouched when the timeout is disabled', () => {
    const external = new AbortController().signal;
    const { signal } = composeSignal(0, external);
    expect(signal).toBe(external);
  });

  it('produces a signal that aborts on timeout', async () => {
    const { signal, release } = composeSignal(10);
    expect(signal?.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(signal?.aborted).toBe(true);
    release();
  });

  it('aborts when the caller aborts', () => {
    const controller = new AbortController();
    const { signal, release } = composeSignal(10_000, controller.signal);

    controller.abort();

    expect(signal?.aborted).toBe(true);
    release();
  });

  it('is already aborted when the caller signal came in aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const { signal, release } = composeSignal(10_000, controller.signal);

    expect(signal?.aborted).toBe(true);
    release();
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ProviderRequestError('503', { status: 503, retryable: true }))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable failure', async () => {
    // A 400 will be a 400 again. Retrying it just spends the caller's budget.
    const fn = vi
      .fn()
      .mockRejectedValue(new ProviderRequestError('400 bad request', { status: 400 }));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('400 bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new ProviderRequestError('500', { status: 500, retryable: true }));

    await expect(withRetry(fn, { baseDelayMs: 1, maxRetries: 2 })).rejects.toThrow('500');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('treats a 429 from an SDK error object as retryable', async () => {
    // SDKs put the status on the error rather than throwing our own type.
    const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(rateLimited).mockResolvedValue('ok');

    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx from an SDK error object', async () => {
    const badRequest = Object.assign(new Error('invalid model'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(badRequest);

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('invalid model');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a timeout as a retryable ProviderRequestError', async () => {
    const fn = vi.fn().mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    await expect(withRetry(fn, { timeoutMs: 10, baseDelayMs: 1, maxRetries: 0 })).rejects.toThrow(
      /timed out after 10ms/,
    );
  });

  it('never retries an abort the caller asked for', async () => {
    // Retrying a cancellation is actively wrong: the caller has said stop.
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });

    await expect(
      withRetry(fn, { signal: controller.signal, baseDelayMs: 1, maxRetries: 3 }),
    ).rejects.toThrow(/cancelled/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes a signal through to the work function', async () => {
    let seen: AbortSignal | undefined;
    await withRetry(
      (signal) => {
        seen = signal;
        return Promise.resolve('ok');
      },
      { timeoutMs: 1000 },
    );
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it('backs off between attempts rather than hammering', async () => {
    const stamps: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      stamps.push(Date.now());
      return Promise.reject(new ProviderRequestError('500', { status: 500, retryable: true }));
    });

    await expect(withRetry(fn, { baseDelayMs: 20, maxRetries: 2 })).rejects.toThrow();

    expect(stamps).toHaveLength(3);
    // 20ms then 40ms — exponential, and generous enough not to be flaky.
    expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(15);
    expect(stamps[2]! - stamps[1]!).toBeGreaterThanOrEqual(30);
  });
});
