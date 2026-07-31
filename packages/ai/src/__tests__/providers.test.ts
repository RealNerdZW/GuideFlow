/*
 * Rationale for the disables below: `vi.fn()` and `vi.hoisted()` are typed with
 * `any` inside Vitest itself, so every mock handle we build here is `any` at the
 * boundary. Narrowing them would mean re-declaring the OpenAI / Anthropic SDK
 * surfaces, which is exactly what this package refuses to depend on. The
 * assertions themselves are all on concretely-typed provider return values.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import type { DOMContext, UserEvent } from '@guideflow/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AnthropicProvider } from '../providers/anthropic.js';
import type { PageContext } from '../providers/interface.js';
import { OllamaProvider } from '../providers/ollama.js';
import { OpenAIProvider } from '../providers/openai.js';

// ── SDK stubs ───────────────────────────────────────────────────────────────
// `openai` and `@anthropic-ai/sdk` are optional peer deps. Both providers reach
// them through a lazy `await import(...)`, which vi.mock intercepts.

const openaiState = vi.hoisted(() => ({
  create: vi.fn(),
  constructedWith: [] as Array<Record<string, unknown>>,
}));

const anthropicState = vi.hoisted(() => ({
  create: vi.fn(),
  constructedWith: [] as Array<Record<string, unknown>>,
}));

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: openaiState.create } };
    constructor(opts: Record<string, unknown>) {
      openaiState.constructedWith.push(opts);
    }
  }
  return { default: MockOpenAI };
});

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: anthropicState.create };
    constructor(opts: Record<string, unknown>) {
      anthropicState.constructedWith.push(opts);
    }
  }
  return { default: MockAnthropic };
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const DOM: DOMContext = {
  url: 'https://app.test/dashboard',
  title: 'Dashboard',
  elements: [],
};

const PAGE: PageContext = {
  url: 'https://app.test/dashboard',
  title: 'Dashboard',
  dom: DOM,
};

const EVENTS: UserEvent[] = [{ type: 'click', target: '#save', timestamp: 1000 }];

/**
 * A single payload exercised against all three providers: one fully-specified
 * step, one entry with no `id` (must be dropped), one with a bogus placement
 * (must be dropped down to a bare step).
 */
const STEPS_JSON = JSON.stringify([
  { id: 'welcome', title: 'Welcome', body: 'Start here', target: '#hero', placement: 'bottom' },
  { title: 'orphan', body: 'no id — dropped' },
  { id: 'bad-placement', title: 'Two', placement: 'diagonal' },
]);

/** The same payload an LLM would emit when it ignores "no markdown fences". */
const FENCED_STEPS_JSON = '```json\n' + STEPS_JSON + '\n```';

function openaiReply(content: string) {
  return { choices: [{ message: { content } }] };
}

function anthropicReply(text: string) {
  return { content: [{ type: 'text', text }] };
}

function ollamaReply(content: string) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ message: { content } }),
  };
}

// ── OpenAIProvider ──────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    openaiState.create.mockReset();
    openaiState.constructedWith.length = 0;
    provider = new OpenAIProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 512,
    });
  });

  describe('generateSteps()', () => {
    it('returns validated steps for a well-formed JSON array', async () => {
      openaiState.create.mockResolvedValue(openaiReply(STEPS_JSON));

      const steps = await provider.generateSteps(DOM, 'tour the dashboard');

      expect(steps).toHaveLength(2);
      expect(steps[0]).toEqual({
        id: 'welcome',
        content: { title: 'Welcome', body: 'Start here' },
        target: '#hero',
        placement: 'bottom',
      });
      // `orphan` had no id and was dropped; `diagonal` is not a PopoverPlacement.
      expect(steps[1]).toEqual({
        id: 'bad-placement',
        content: { title: 'Two', body: '' },
      });
    });

    it('forwards the configured api key, model, temperature and token budget', async () => {
      openaiState.create.mockResolvedValue(openaiReply('[]'));

      await provider.generateSteps(DOM, 'anything');

      // maxRetries: 0 — `withRetry` owns the retry policy; letting the SDK retry
      // too would multiply attempts and blow past the caller's timeout budget.
      expect(openaiState.constructedWith[0]).toEqual({ apiKey: 'sk-test', maxRetries: 0 });
      const args = openaiState.create.mock.calls[0]![0];
      expect(args.model).toBe('gpt-4o');
      expect(args.temperature).toBe(0.7);
      expect(args.max_tokens).toBe(512);
      expect(args.messages[0].role).toBe('system');
      expect(args.messages[1].content).toContain('anything');
    });

    // Regression for `no-json-mode-hand-parsed`. This test used to assert the
    // OPPOSITE — that perfectly good fenced steps came back as [] — because the
    // provider handed the raw completion straight to JSON.parse and swallowed
    // the throw. A markdown fence is the single most common LLM output shape.
    it('parses a ```json-fenced response instead of discarding it', async () => {
      openaiState.create.mockResolvedValue(openaiReply(FENCED_STEPS_JSON));

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['welcome', 'bad-placement']);
    });

    it('asks for a strict JSON schema rather than trusting the prompt', async () => {
      openaiState.create.mockResolvedValue(openaiReply('{"steps":[]}'));

      await provider.generateSteps(DOM, 'tour');

      const args = openaiState.create.mock.calls[0]![0];
      expect(args.response_format.type).toBe('json_schema');
      expect(args.response_format.json_schema.strict).toBe(true);
      expect(args.response_format.json_schema.name).toBe('guideflow_steps');
    });

    it('recovers steps from a response with prose wrapped around the JSON', async () => {
      openaiState.create.mockResolvedValue(
        openaiReply(`Sure! Here is the tour you asked for:
{"steps":[{"id":"a","content":{"title":"A"}}]}
Let me know if you want changes.`),
      );

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['a']);
    });

    it('returns [] rather than throwing on malformed JSON', async () => {
      openaiState.create.mockResolvedValue(openaiReply('I am afraid I cannot do that.'));

      await expect(provider.generateSteps(DOM, 'tour')).resolves.toEqual([]);
    });

    it('returns [] when the completion carries no choices', async () => {
      openaiState.create.mockResolvedValue({ choices: [] });

      await expect(provider.generateSteps(DOM, 'tour')).resolves.toEqual([]);
    });

    it('rejects when the SDK call fails instead of swallowing the error', async () => {
      openaiState.create.mockRejectedValue(new Error('429 rate limit exceeded'));

      await expect(provider.generateSteps(DOM, 'tour')).rejects.toThrow('429 rate limit exceeded');
    });
  });

  describe('detectIntent()', () => {
    it('maps a well-formed signal, accepting the `intent` alias', async () => {
      openaiState.create.mockResolvedValue(
        openaiReply(JSON.stringify({ intent: 'confused', confidence: 0.82 })),
      );

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'confused',
        confidence: 0.82,
      });
    });

    it('falls back to exploring/0 on malformed output', async () => {
      openaiState.create.mockResolvedValue(openaiReply('the user seems confused'));

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'exploring',
        confidence: 0,
      });
    });

    it('rejects when the SDK call fails', async () => {
      openaiState.create.mockRejectedValue(new Error('socket hang up'));

      await expect(provider.detectIntent(EVENTS)).rejects.toThrow('socket hang up');
    });
  });

  describe('answerQuestion()', () => {
    it('maps a well-formed answer, accepting the `answer` alias', async () => {
      openaiState.create.mockResolvedValue(
        openaiReply(
          JSON.stringify({ answer: 'Click Save.', highlightSelector: '#save', confidence: 0.9 }),
        ),
      );

      await expect(provider.answerQuestion('how do I save?', PAGE)).resolves.toEqual({
        text: 'Click Save.',
        highlights: ['#save'],
        confidence: 0.9,
      });
    });

    it('falls back to the canned apology on malformed output', async () => {
      openaiState.create.mockResolvedValue(openaiReply('<html>502 Bad Gateway</html>'));

      await expect(provider.answerQuestion('how do I save?', PAGE)).resolves.toEqual({
        text: 'Sorry, I could not answer that.',
        highlights: [],
      });
    });

    it('rejects when the SDK call fails', async () => {
      openaiState.create.mockRejectedValue(new Error('invalid api key'));

      await expect(provider.answerQuestion('q', PAGE)).rejects.toThrow('invalid api key');
    });
  });
});

// ── AnthropicProvider ───────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    anthropicState.create.mockReset();
    anthropicState.constructedWith.length = 0;
    provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
  });

  describe('generateSteps()', () => {
    it('returns validated steps for a well-formed JSON array', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply(STEPS_JSON));

      const steps = await provider.generateSteps(DOM, 'tour the dashboard');

      expect(steps).toHaveLength(2);
      expect(steps[0]).toEqual({
        id: 'welcome',
        content: { title: 'Welcome', body: 'Start here' },
        target: '#hero',
        placement: 'bottom',
      });
      expect(steps[1]?.id).toBe('bad-placement');
      expect(steps[1]?.placement).toBeUndefined();
    });

    it('forwards the configured api key and the default model', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply('[]'));

      await provider.generateSteps(DOM, 'anything');

      expect(anthropicState.constructedWith[0]).toEqual({ apiKey: 'sk-ant-test', maxRetries: 0 });
      const args = anthropicState.create.mock.calls[0]![0];
      // claude-3-haiku-20240307 retired on 2026-04-19 and now 404s
      // (AUDIT `anthropic-default-model-retired`).
      expect(args.model).toBe('claude-haiku-4-5');
      expect(args.max_tokens).toBe(2048);
      expect(args.messages[0].role).toBe('user');
    });

    // Regression for `no-json-mode-hand-parsed` — this used to assert [].
    it('parses a ```json-fenced response instead of discarding it', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply(FENCED_STEPS_JSON));

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['welcome', 'bad-placement']);
    });

    it('steers with a forced tool call rather than a prompt instruction', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply('{"steps":[]}'));

      await provider.generateSteps(DOM, 'tour');

      const args = anthropicState.create.mock.calls[0]![0];
      expect(args.tools[0].name).toBe('guideflow_steps');
      expect(args.tool_choice).toEqual({ type: 'tool', name: 'guideflow_steps' });
    });

    it('returns [] rather than throwing on malformed JSON', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply('Sure! Here are some steps:'));

      await expect(provider.generateSteps(DOM, 'tour')).resolves.toEqual([]);
    });

    it('reads the tool_use block, which is now the happy path', async () => {
      anthropicState.create.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'guideflow_steps',
            input: { steps: [{ id: 'from-tool', content: { title: 'Tool' } }] },
          },
        ],
      });

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['from-tool']);
    });

    it('falls back to a text block when the model declines the tool', async () => {
      anthropicState.create.mockResolvedValue(
        anthropicReply('{"steps":[{"id":"from-text","content":{"title":"Text"}}]}'),
      );

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['from-text']);
    });

    it('rejects when the SDK call fails instead of swallowing the error', async () => {
      anthropicState.create.mockRejectedValue(new Error('overloaded_error'));

      await expect(provider.generateSteps(DOM, 'tour')).rejects.toThrow('overloaded_error');
    });
  });

  describe('detectIntent()', () => {
    it('clamps an out-of-range confidence from a well-formed signal', async () => {
      anthropicState.create.mockResolvedValue(
        anthropicReply(JSON.stringify({ type: 'stuck', confidence: 4.2, element: '#checkout' })),
      );

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'stuck',
        confidence: 1,
        element: '#checkout',
      });
    });

    it('falls back to exploring/0 on malformed output', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply('not json'));

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'exploring',
        confidence: 0,
      });
    });
  });

  describe('answerQuestion()', () => {
    it('falls back to the canned apology on malformed output', async () => {
      anthropicState.create.mockResolvedValue(anthropicReply('I think you should...'));

      await expect(provider.answerQuestion('how do I save?', PAGE)).resolves.toEqual({
        text: 'Sorry, I could not answer that.',
        highlights: [],
      });
    });

    it('rejects when the SDK call fails', async () => {
      anthropicState.create.mockRejectedValue(new Error('authentication_error'));

      await expect(provider.answerQuestion('q', PAGE)).rejects.toThrow('authentication_error');
    });
  });
});

// ── OllamaProvider ──────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Reads the JSON body handed to the n-th fetch call. */
  function requestBody(index = 0): Record<string, any> {
    const init = fetchMock.mock.calls[index]![1];
    return JSON.parse(init.body as string);
  }

  it('posts to the configured baseUrl and model, with the trailing slash stripped', async () => {
    fetchMock.mockResolvedValue(ollamaReply('[]'));
    const provider = new OllamaProvider({ baseUrl: 'http://ollama.test:1234/', model: 'mistral' });

    await provider.generateSteps(DOM, 'tour');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://ollama.test:1234/api/chat');
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = requestBody();
    expect(body['model']).toBe('mistral');
    expect(body['stream']).toBe(false);
    expect(body['messages'][0].role).toBe('system');
    expect(body['messages'][1].content).toContain('tour');
  });

  it('defaults to localhost:11434 and llama3', async () => {
    fetchMock.mockResolvedValue(ollamaReply('[]'));
    const provider = new OllamaProvider();

    await provider.detectIntent(EVENTS);

    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/chat');
    expect(requestBody()['model']).toBe('llama3');
  });

  describe('generateSteps()', () => {
    it('returns validated steps for a well-formed JSON array', async () => {
      fetchMock.mockResolvedValue(ollamaReply(STEPS_JSON));
      const provider = new OllamaProvider();

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['welcome', 'bad-placement']);
      expect(steps[0]?.target).toBe('#hero');
    });

    // PINNED BEHAVIOUR, NOT DESIRED BEHAVIOUR — audit `no-json-mode-hand-parsed`.
    // Ollama supports `format: "json"`; the provider does not pass it.
    it('parses a ```json-fenced response instead of discarding it', async () => {
      fetchMock.mockResolvedValue(ollamaReply(FENCED_STEPS_JSON));
      const provider = new OllamaProvider();

      const steps = await provider.generateSteps(DOM, 'tour');

      expect(steps.map((s) => s.id)).toEqual(['welcome', 'bad-placement']);
    });

    it('asks Ollama for schema-constrained output, and can be cancelled', async () => {
      fetchMock.mockResolvedValue(ollamaReply('{"steps":[]}'));
      const provider = new OllamaProvider();

      await provider.generateSteps(DOM, 'tour');

      // `format` used to be absent entirely — the only defence against prose
      // was a sentence in the system prompt.
      expect(requestBody()['format']).toMatchObject({ type: 'object' });
      // And the fetch had no signal, so an unreachable baseUrl hung forever
      // (AUDIT `provider-no-timeout-abort`).
      expect(fetchMock.mock.calls[0]![1].signal).toBeDefined();
    });

    it('returns [] rather than throwing on malformed JSON', async () => {
      fetchMock.mockResolvedValue(ollamaReply('here you go!'));
      const provider = new OllamaProvider();

      await expect(provider.generateSteps(DOM, 'tour')).resolves.toEqual([]);
    });

    it('returns [] when the response carries no message content', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({}),
      });
      const provider = new OllamaProvider();

      await expect(provider.generateSteps(DOM, 'tour')).resolves.toEqual([]);
    });

    it('rejects with the HTTP status when the server returns a non-2xx', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });
      const provider = new OllamaProvider({ model: 'nope' });

      await expect(provider.generateSteps(DOM, 'tour')).rejects.toThrow('404 Not Found');
    });

    it('rejects when fetch itself fails instead of swallowing the error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new OllamaProvider();

      await expect(provider.generateSteps(DOM, 'tour')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('detectIntent()', () => {
    it('maps a well-formed signal', async () => {
      fetchMock.mockResolvedValue(ollamaReply(JSON.stringify({ type: 'engaged', confidence: 0.5 })));
      const provider = new OllamaProvider();

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'engaged',
        confidence: 0.5,
      });
    });

    it('coerces an unrecognised intent type to exploring', async () => {
      fetchMock.mockResolvedValue(
        ollamaReply(JSON.stringify({ intent: 'buying-a-boat', confidence: 0.6 })),
      );
      const provider = new OllamaProvider();

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'exploring',
        confidence: 0.6,
      });
    });

    it('falls back to exploring/0 on malformed output', async () => {
      fetchMock.mockResolvedValue(ollamaReply('¯\\_(ツ)_/¯'));
      const provider = new OllamaProvider();

      await expect(provider.detectIntent(EVENTS)).resolves.toEqual({
        type: 'exploring',
        confidence: 0,
      });
    });
  });

  describe('answerQuestion()', () => {
    it('collects highlights from both highlightSelector and highlights', async () => {
      fetchMock.mockResolvedValue(
        ollamaReply(
          JSON.stringify({
            answer: 'Use the toolbar.',
            highlightSelector: '#toolbar',
            highlights: ['#save', 42],
          }),
        ),
      );
      const provider = new OllamaProvider();

      await expect(provider.answerQuestion('where?', PAGE)).resolves.toEqual({
        text: 'Use the toolbar.',
        highlights: ['#toolbar', '#save'],
      });
    });

    // Note the wording differs from the OpenAI/Anthropic fallback — this is the
    // ollama-only string, reached only when JSON.parse throws.
    it('falls back to "Unable to answer." on malformed output', async () => {
      fetchMock.mockResolvedValue(ollamaReply('no idea'));
      const provider = new OllamaProvider();

      await expect(provider.answerQuestion('where?', PAGE)).resolves.toEqual({
        text: 'Unable to answer.',
        highlights: [],
      });
    });

    it('rejects when fetch itself fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const provider = new OllamaProvider();

      await expect(provider.answerQuestion('where?', PAGE)).rejects.toThrow('fetch failed');
    });
  });
});
