/**
 * ProxyProvider — the provider you should be using in a browser.
 *
 * Every other provider in this package holds an API key. A key in browser code
 * is public: it ships in the bundle, and anyone who opens devtools can spend
 * your quota. There is no way to obfuscate around that, and no configuration
 * that makes it safe (AUDIT `api-keys-shipped-to-browser`).
 *
 * This provider holds no credential at all. It POSTs to an endpoint you run,
 * which holds the key server-side and can apply the things a browser cannot:
 * authentication, rate limits, spend caps, and audit logging.
 *
 * Wire format — one POST per call, `{ kind, ...payload }`:
 *
 *   { kind: 'generateSteps', context: DOMContext, prompt: string } -> Step[]
 *   { kind: 'detectIntent',  events: UserEvent[] }                 -> IntentSignal
 *   { kind: 'answerQuestion', question: string, context: PageContext } -> GuidedAnswer
 *
 * Your endpoint may return either the bare value or `{ data: <value> }`. The
 * response is validated here regardless, so a compromised or buggy backend
 * cannot inject arbitrary shapes into the tour engine.
 *
 * A minimal Express implementation is in the guide at
 * apps/docs/guide/ai-proxy.md.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

import { validateSteps, validateIntentSignal, validateGuidedAnswer } from '../validation.js';

import type { AIProvider, PageContext } from './interface.js';

export interface ProxyProviderOptions {
  /**
   * URL of your endpoint. Relative paths are resolved against the current
   * origin, which is usually what you want — it keeps the request same-origin
   * and lets your existing session cookie authenticate it.
   */
  endpoint: string;
  /**
   * Extra headers to send, e.g. a CSRF token. Do NOT put an LLM API key here:
   * anything in this object is visible to the user. A function is accepted so a
   * short-lived token can be refreshed per call.
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Passed through to fetch. Default 'same-origin'. */
  credentials?: RequestCredentials;
  /** Abort a call that takes longer than this. Default 30_000 ms. */
  timeoutMs?: number;
  /** Called when a request fails, for your own telemetry. */
  onError?: (error: Error) => void;
}

type RequestKind = 'generateSteps' | 'detectIntent' | 'answerQuestion';

export class ProxyProvider implements AIProvider {
  private opts: Required<Omit<ProxyProviderOptions, 'headers' | 'onError'>> &
    Pick<ProxyProviderOptions, 'headers' | 'onError'>;

  constructor(opts: ProxyProviderOptions) {
    if (!opts.endpoint) {
      throw new Error('[@guideflow/ai] ProxyProvider requires an `endpoint`.');
    }
    this.opts = {
      endpoint: opts.endpoint,
      credentials: opts.credentials ?? 'same-origin',
      timeoutMs: opts.timeoutMs ?? 30_000,
      ...(opts.headers !== undefined && { headers: opts.headers }),
      ...(opts.onError !== undefined && { onError: opts.onError }),
    };
  }

  private async post(kind: RequestKind, payload: Record<string, unknown>): Promise<unknown> {
    const { headers, timeoutMs, endpoint, credentials, onError } = this.opts;

    const extra = typeof headers === 'function' ? await headers() : (headers ?? {});

    // AbortController rather than a racing timer: this actually cancels the
    // in-flight request instead of leaving it running and ignoring the result.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify({ kind, ...payload }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`[@guideflow/ai] Proxy responded ${res.status} ${res.statusText}`);
      }

      const json: unknown = await res.json();
      // Accept `{ data: … }` or the bare value, so a backend that wraps its
      // responses by convention does not need a special case.
      if (json !== null && typeof json === 'object' && 'data' in json) {
        return (json as { data: unknown }).data;
      }
      return json;
    } catch (err) {
      const error =
        err instanceof Error && err.name === 'AbortError'
          ? new Error(`[@guideflow/ai] Proxy request timed out after ${timeoutMs}ms`)
          : err instanceof Error
            ? err
            : new Error(String(err));
      onError?.(error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    return validateSteps(await this.post('generateSteps', { context, prompt }));
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    return validateIntentSignal(await this.post('detectIntent', { events }));
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    return validateGuidedAnswer(await this.post('answerQuestion', { question, context }));
  }
}
