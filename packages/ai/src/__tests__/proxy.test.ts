import type { DOMContext, UserEvent } from '@guideflow/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { resetBrowserKeyWarnings } from '../providers/browser-guard.js';
import type { PageContext } from '../providers/interface.js';
import { ProxyProvider } from '../providers/proxy.js';

const DOM: DOMContext = { url: 'https://app.example/x', title: 'X', elements: [] };
const PAGE: PageContext = { url: 'https://app.example/x', title: 'X', dom: DOM };

/** Minimal fetch stub returning `body` as JSON with the given status. */
function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    } as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProxyProvider', () => {
  it('requires an endpoint', () => {
    // @ts-expect-error — deliberately omitting the required option
    expect(() => new ProxyProvider({})).toThrow(/requires an `endpoint`/);
  });

  it('posts generateSteps and validates the response', async () => {
    const fetchMock = stubFetch([{ id: 's1', title: 'One', body: 'B' }]);
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    const steps = await provider.generateSteps(DOM, 'walk me through');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'generateSteps',
      context: DOM,
      prompt: 'walk me through',
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe('s1');
  });

  it('unwraps a { data } envelope', async () => {
    stubFetch({ data: [{ id: 's1', title: 'One' }] });
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    expect(await provider.generateSteps(DOM, '')).toHaveLength(1);
  });

  it('validates a hostile response rather than trusting the backend', async () => {
    // A compromised proxy must not be able to inject arbitrary shapes.
    stubFetch([{ id: 'ok', title: 'T' }, { noId: true }, 'a string', null]);
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    const steps = await provider.generateSteps(DOM, '');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe('ok');
  });

  it('sends detectIntent and falls back on a malformed response', async () => {
    stubFetch({ nonsense: true });
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    const events: UserEvent[] = [{ type: 'click', timestamp: 1 }];
    expect(await provider.detectIntent(events)).toEqual({ type: 'exploring', confidence: 0 });
  });

  it('sends answerQuestion', async () => {
    const fetchMock = stubFetch({ text: 'Because.', highlights: ['#a'] });
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    const answer = await provider.answerQuestion('why?', PAGE);
    expect(answer.text).toBe('Because.');

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { kind: string };
    expect(body.kind).toBe('answerQuestion');
  });

  it('rejects on a non-2xx response', async () => {
    stubFetch({}, 500);
    const provider = new ProxyProvider({ endpoint: '/api/ai' });

    await expect(provider.generateSteps(DOM, '')).rejects.toThrow(/Proxy responded 500/);
  });

  it('reports failures through onError', async () => {
    stubFetch({}, 403);
    const onError = vi.fn();
    const provider = new ProxyProvider({ endpoint: '/api/ai', onError });

    await expect(provider.generateSteps(DOM, '')).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('merges static headers', async () => {
    const fetchMock = stubFetch([]);
    const provider = new ProxyProvider({ endpoint: '/api/ai', headers: { 'X-CSRF': 'tok' } });

    await provider.generateSteps(DOM, '');
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-CSRF']).toBe('tok');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('resolves a headers function per call, so short-lived tokens can refresh', async () => {
    const fetchMock = stubFetch([]);
    let n = 0;
    const provider = new ProxyProvider({
      endpoint: '/api/ai',
      headers: () => ({ 'X-Token': `t${++n}` }),
    });

    await provider.generateSteps(DOM, '');
    await provider.generateSteps(DOM, '');

    const first = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    const second = (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(first['X-Token']).toBe('t1');
    expect(second['X-Token']).toBe('t2');
  });

  it('defaults credentials to same-origin', async () => {
    const fetchMock = stubFetch([]);
    await new ProxyProvider({ endpoint: '/api/ai' }).generateSteps(DOM, '');

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].credentials).toBe('same-origin');
  });

  it('aborts and reports a timeout', async () => {
    vi.useFakeTimers();
    // Never resolves, but observes the abort signal.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
      ),
    );

    const provider = new ProxyProvider({ endpoint: '/api/ai', timeoutMs: 1000 });
    const promise = provider.generateSteps(DOM, '');
    const assertion = expect(promise).rejects.toThrow(/timed out after 1000ms/);

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('browser API-key guard', () => {
  beforeEach(() => {
    resetBrowserKeyWarnings();
  });

  it('warns once when a key-holding provider is constructed in a browser', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { OpenAIProvider } = await import('../providers/openai.js');

    new OpenAIProvider({ apiKey: 'sk-live-secret' });
    new OpenAIProvider({ apiKey: 'sk-live-secret' });

    // happy-dom means `window` exists, so this is the browser path.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('ProxyProvider');
    // The key itself must never be echoed into the console.
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('sk-live-secret');
  });

  it('stays silent when no key is supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { OpenAIProvider } = await import('../providers/openai.js');

    new OpenAIProvider({ apiKey: '' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for ProxyProvider, which holds no credential', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    new ProxyProvider({ endpoint: '/api/ai' });

    expect(warn).not.toHaveBeenCalled();
  });
});
