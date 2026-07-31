/**
 * Timeouts, cancellation and retries for provider calls.
 *
 * A grep for `signal`, `timeout`, `AbortController` and `retry` across this
 * package used to return zero implementation hits outside `ProxyProvider`
 * (AUDIT `provider-no-timeout-abort`). The consequences differ by provider but
 * all end the same way — a promise that never settles:
 *
 *   - Ollama's `fetch` had no signal and no timeout, so an unreachable
 *     `baseUrl` or a local model chewing through a long context left
 *     `generate()` pending forever with no way to cancel it.
 *   - The SDK providers inherit their SDK's defaults, which a caller who wants
 *     a 5-second budget for a UI interaction cannot see or change.
 *
 * Everything here is dependency-free and works in a browser, in Node 18+, and
 * in workers.
 */

/** Timeout and cancellation options every provider accepts. */
export interface RequestOptions {
  /**
   * Abort a call that takes longer than this. Default 30_000 ms.
   * Pass 0 to disable — only sensible for a local model you trust.
   */
  timeoutMs?: number
  /**
   * Your own signal, composed with the timeout. Aborting it aborts the call.
   * `GuideBrain` supplies one so `destroy()` cancels work already in flight.
   */
  signal?: AbortSignal
  /**
   * How many times to retry a *retryable* failure — a timeout, a network
   * error, or a 429/5xx. Default 2 (so three attempts in total).
   * Aborts from your own `signal` are never retried.
   */
  maxRetries?: number
}

/** An error carrying enough information to decide whether retrying is sane. */
export class ProviderRequestError extends Error {
  readonly status: number | undefined
  readonly retryable: boolean

  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'ProviderRequestError'
    this.status = opts.status
    this.retryable = opts.retryable ?? false
  }
}

/**
 * Compose a caller signal with a timeout.
 *
 * `AbortSignal.any` and `AbortSignal.timeout` are used when present (all
 * current browsers, Node 20+) and hand-rolled otherwise, because Node 18 is a
 * supported engine and has neither.
 *
 * Returns a `release()` the caller MUST invoke in a `finally`: without it the
 * timer keeps the event loop alive and the listener on the caller's signal
 * leaks for as long as that signal does.
 */
export function composeSignal(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal | undefined; release: () => void } {
  if (timeoutMs <= 0) {
    return { signal: external, release: () => { /* nothing to release */ } }
  }

  const AnyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  const TimeoutFn = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout

  if (typeof TimeoutFn === 'function') {
    const timeoutSignal = TimeoutFn.call(AbortSignal, timeoutMs)
    if (external === undefined) return { signal: timeoutSignal, release: () => {} }
    if (typeof AnyFn === 'function') {
      return { signal: AnyFn.call(AbortSignal, [external, timeoutSignal]), release: () => {} }
    }
  }

  // Node 18 fallback.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onExternalAbort = (): void => { controller.abort(external?.reason) }
  if (external) {
    if (external.aborted) controller.abort(external.reason)
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }

  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

/** Was this abort the caller's doing, rather than our timeout firing? */
function isExternalAbort(external: AbortSignal | undefined): boolean {
  return external?.aborted === true
}

function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderRequestError) return err.retryable
  if (!(err instanceof Error)) return false
  // A timeout or a dropped connection is worth another go; a 400 is not.
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
  // SDKs surface HTTP status on the error object rather than throwing our type.
  const status = (err as { status?: unknown }).status
  if (typeof status === 'number') return status === 429 || status >= 500
  return err.name === 'TypeError' && /fetch|network/i.test(err.message)
}

/**
 * Run `fn` with retries and exponential backoff.
 *
 * Deliberately *not* jittered: this runs at most three times against a single
 * endpoint from a single browser tab, so the thundering-herd problem jitter
 * solves does not exist here, and determinism makes the behaviour testable.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal | undefined) => Promise<T>,
  opts: RequestOptions & { baseDelayMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxRetries = Math.max(0, opts.maxRetries ?? 2)
  const baseDelayMs = opts.baseDelayMs ?? 300

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { signal, release } = composeSignal(timeoutMs, opts.signal)
    try {
      return await fn(signal)
    } catch (err) {
      lastError = err
      // The caller cancelled. Retrying would be actively wrong.
      if (isExternalAbort(opts.signal)) throw normalise(err, timeoutMs, true)
      if (attempt === maxRetries || !isRetryable(err)) throw normalise(err, timeoutMs, false)
      await sleep(baseDelayMs * 2 ** attempt, opts.signal)
    } finally {
      release()
    }
  }
  throw normalise(lastError, timeoutMs, false)
}

function normalise(err: unknown, timeoutMs: number, cancelled: boolean): Error {
  if (cancelled) {
    return new ProviderRequestError('[@guideflow/ai] Request cancelled', { retryable: false })
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new ProviderRequestError(
      `[@guideflow/ai] Request timed out after ${timeoutMs}ms`,
      { retryable: true },
    )
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Cancellable sleep — a pending backoff must not outlive an abort. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderRequestError('[@guideflow/ai] Request cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new ProviderRequestError('[@guideflow/ai] Request cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
