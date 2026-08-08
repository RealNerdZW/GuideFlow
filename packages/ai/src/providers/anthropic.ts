/**
 * Anthropic (Claude) provider for @guideflow/ai.
 * Requires `@anthropic-ai/sdk` peer dependency.
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

export interface AnthropicProviderOptions extends RequestOptions {
  apiKey?: string;
  /** Default: claude-haiku-4-5 (fastest + cheapest current model). */
  model?: string;
  maxTokens?: number;
}

const SYSTEM_PROMPT = `
You are GuideFlow, an AI assistant that helps developers create onboarding tours.
Always respond with valid JSON only — no prose, no markdown fences.
`.trim();

/**
 * The default model.
 *
 * This was `claude-3-haiku-20240307` until its retirement date of 2026-04-19
 * passed, at which point the id started returning HTTP 404 `not_found_error` —
 * so anyone following the documented setup got a 404 on every single call
 * (AUDIT `anthropic-default-model-retired`). Model ids retire; check this one
 * each release, and prefer an alias without a date suffix where the vendor
 * offers it.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5';

export class AnthropicProvider implements AIProvider {
  private opts: Required<Omit<AnthropicProviderOptions, keyof RequestOptions>>;
  private req: RequestOptions;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.opts = {
      apiKey: opts.apiKey ?? (typeof process !== 'undefined' ? process.env['ANTHROPIC_API_KEY'] ?? '' : ''),
      model: opts.model ?? DEFAULT_MODEL,
      maxTokens: opts.maxTokens ?? 2048,
    };
    this.req = {
      timeoutMs: opts.timeoutMs ?? 30_000,
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.signal !== undefined && { signal: opts.signal }),
    };
    warnIfBrowserKey('AnthropicProvider', this.opts.apiKey);
  }

  private async client() {
    const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => {
      throw new Error(
        '[@guideflow/ai] Anthropic peer dependency not found. Run: npm i @anthropic-ai/sdk',
      );
    });
    // maxRetries: 0 — `withRetry` owns the retry policy. Two retry layers
    // multiply rather than compose.
    return new Anthropic({ apiKey: this.opts.apiKey, maxRetries: 0 });
  }

  /**
   * Steers with a single-tool `tool_choice`, which is Anthropic's structured
   * output mechanism: the model must call the tool, and the tool's input schema
   * is the shape we want. That is stronger than asking for JSON in the prompt,
   * which is all this provider used to do.
   *
   * The `as never` casts are unavoidable at the call boundary: `@anthropic-ai/sdk`
   * is an optional peer dependency, so its types are not guaranteed to be
   * present at compile time and the lazy import resolves to a structural type
   * that does not carry the tools overload. The response is validated
   * downstream regardless, so nothing here is trusted.
   */
  private async complete(
    userContent: string,
    spec: JsonSchemaSpec,
    signal?: AbortSignal,
  ): Promise<string> {
    const anthropic = await this.client();
    const response = await anthropic.messages.create(
      {
        model: this.opts.model,
        max_tokens: this.opts.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        tools: [
          {
            name: spec.name,
            description: 'Return the requested GuideFlow data.',
            input_schema: spec.schema,
          },
        ] as never,
        tool_choice: { type: 'tool', name: spec.name } as never,
      },
      { ...(signal !== undefined && { signal }) },
    );

    // Prefer the tool call; fall back to a text block for a model or account
    // that declined to use the tool.
    for (const block of response.content) {
      if (block.type === 'tool_use') return JSON.stringify(block.input);
    }
    const first = response.content[0];
    return first?.type === 'text' ? first.text : '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const text = await withRetry(
      (signal) =>
        this.complete(
          `Generate a product tour.
Prompt: ${prompt || 'Create an overview tour of the page.'}
DOM snapshot: ${JSON.stringify(context)}`,
          STEPS_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(text, unwrapSteps, [], warnUnparseable('generateSteps'));
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    const text = await withRetry(
      (signal) =>
        this.complete(
          `Given these user events, detect intent.
Events: ${JSON.stringify(events.slice(-20))}`,
          INTENT_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(
      text,
      validateIntentSignal,
      { type: 'exploring' as const, confidence: 0 },
      warnUnparseable('detectIntent'),
    );
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    const text = await withRetry(
      (signal) =>
        this.complete(
          `Answer this user question.
Question: ${question}
URL: ${context.url} | Title: ${context.title}
DOM: ${JSON.stringify(context.dom)}`,
          ANSWER_SCHEMA,
          signal,
        ),
      this.req,
    );
    return parseModelJson(
      text,
      validateGuidedAnswer,
      { text: 'Sorry, I could not answer that.', highlights: [] },
      warnUnparseable('answerQuestion'),
    );
  }
}
