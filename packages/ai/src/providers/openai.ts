/**
 * OpenAI provider for @guideflow/ai.
 * Requires `openai` peer dependency: `npm i openai`.
 *
 * The provider is deliberately lazy — it only imports `openai` inside each
 * method so the package compiles and tree-shakes correctly even when the
 * peer dep is absent.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

import {
  parseModelJson,
  unwrapSteps,
  warnUnparseable,
  STEPS_SCHEMA,
  INTENT_SCHEMA,
  ANSWER_SCHEMA,
  type JsonSchemaSpec,
} from '../json.js';
import { withRetry, type RequestOptions } from '../request.js';
import { validateIntentSignal, validateGuidedAnswer } from '../validation.js';

import { warnIfBrowserKey } from './browser-guard.js';
import type { AIProvider, PageContext } from './interface.js';

export interface OpenAIProviderOptions extends RequestOptions {
  /** OpenAI API key. Defaults to `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Model to use (default: gpt-4o-mini for cost efficiency). */
  model?: string;
  /** Temperature (default: 0.2 for deterministic tours). */
  temperature?: number;
  /** Maximum tokens per completion (default: 2048). */
  maxTokens?: number;
}

const SYSTEM_PROMPT = `
You are GuideFlow, an AI assistant that helps developers create onboarding tours.
Always respond with valid JSON only — no prose, no markdown fences.
`.trim();

export class OpenAIProvider implements AIProvider {
  private opts: Required<Omit<OpenAIProviderOptions, keyof RequestOptions>>;
  private req: RequestOptions;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.opts = {
      apiKey: opts.apiKey ?? (typeof process !== 'undefined' ? process.env['OPENAI_API_KEY'] ?? '' : ''),
      model: opts.model ?? 'gpt-4o-mini',
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens ?? 2048,
    };
    this.req = {
      timeoutMs: opts.timeoutMs ?? 30_000,
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.signal !== undefined && { signal: opts.signal }),
    };
    warnIfBrowserKey('OpenAIProvider', this.opts.apiKey);
  }

  private async client() {
    // Lazy import so the package works without openai installed at compile time
    const { default: OpenAI } = await import('openai').catch(() => {
      throw new Error(
        '[@guideflow/ai] OpenAI peer dependency not found. Run: npm i openai',
      );
    });
    // maxRetries: 0 — `withRetry` owns the retry policy, and letting the SDK
    // retry too would multiply the attempts (3 x 2 = 6 calls) and blow past the
    // caller's timeout budget without telling anyone.
    return new OpenAI({ apiKey: this.opts.apiKey, maxRetries: 0 });
  }

  /**
   * `json_schema` with `strict: true`, not a prompt instruction. The old code's
   * only defence against prose was the system prompt above, and models ignore
   * it often enough that `JSON.parse` throwing was routine
   * (AUDIT `no-json-mode-hand-parsed`).
   */
  private async complete(
    userContent: string,
    spec: JsonSchemaSpec,
    signal?: AbortSignal,
  ): Promise<string> {
    const openai = await this.client();
    const response = await openai.chat.completions.create(
      {
        model: this.opts.model,
        temperature: this.opts.temperature,
        max_tokens: this.opts.maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: spec.name, strict: true, schema: spec.schema },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      },
      { ...(signal !== undefined && { signal }) },
    );
    return response.choices[0]?.message?.content ?? '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const content = await withRetry(
      (signal) =>
        this.complete(
          `Generate a product tour as JSON.
Prompt: ${prompt || 'Create an overview tour of the page.'}
DOM snapshot (compact): ${JSON.stringify(context)}`,
          STEPS_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(content, unwrapSteps, [], warnUnparseable('generateSteps'));
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    const content = await withRetry(
      (signal) =>
        this.complete(
          `Given this list of user events, detect the user's intent.
Events: ${JSON.stringify(events.slice(-20))}`,
          INTENT_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(
      content,
      validateIntentSignal,
      { type: 'exploring' as const, confidence: 0 },
      warnUnparseable('detectIntent'),
    );
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    const content = await withRetry(
      (signal) =>
        this.complete(
          `Answer this user question about the current page.
Question: ${question}
Page URL: ${context.url}
Page title: ${context.title}
DOM (compact): ${JSON.stringify(context.dom)}`,
          ANSWER_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(
      content,
      validateGuidedAnswer,
      { text: 'Sorry, I could not answer that.', highlights: [] },
      warnUnparseable('answerQuestion'),
    );
  }
}
