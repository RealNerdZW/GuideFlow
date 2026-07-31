/**
 * Ollama provider for @guideflow/ai.
 * Talks to a locally running Ollama instance via its HTTP API.
 * Zero additional dependencies — uses the built-in Fetch API.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

import {
  parseModelJson,
  unwrapSteps,
  warnUnparseable,
  STEPS_SCHEMA,
  INTENT_SCHEMA,
  ANSWER_SCHEMA,
} from '../json.js';
import { withRetry, ProviderRequestError, type RequestOptions } from '../request.js';
import { validateIntentSignal, validateGuidedAnswer } from '../validation.js';

import type { AIProvider, PageContext } from './interface.js';

export interface OllamaProviderOptions extends RequestOptions {
  /** Base URL of the Ollama server. Default: http://localhost:11434 */
  baseUrl?: string;
  /** Model name to use. Default: llama3 */
  model?: string;
}

interface OllamaResponse {
  message?: { content?: string };
}

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;
  private req: RequestOptions;

  constructor(opts: OllamaProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = opts.model ?? 'llama3';
    this.req = {
      // Local models are slow but not infinitely so, and "no timeout" was the
      // old behaviour: an unreachable baseUrl left the promise pending forever
      // (AUDIT `provider-no-timeout-abort`). 60s is generous for a first-token
      // on a cold local model without being indistinguishable from a hang.
      timeoutMs: opts.timeoutMs ?? 60_000,
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.signal !== undefined && { signal: opts.signal }),
    };
  }

  /**
   * `format` takes a JSON Schema in Ollama 0.5+ and the literal string 'json'
   * in older builds. Sending the schema to a build that only understands the
   * string is not fatal — it falls back to free-form text, which
   * `parseModelJson` then has to rescue. That is why both layers exist.
   */
  private async complete(
    prompt: string,
    schema: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: schema,
        messages: [
          {
            role: 'system',
            content:
              'You are GuideFlow, an AI that generates product tour JSON. Respond with valid JSON only — no prose, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      ...(signal !== undefined && { signal }),
    });

    if (!res.ok) {
      throw new ProviderRequestError(
        `[@guideflow/ai] Ollama request failed: ${res.status} ${res.statusText}`,
        { status: res.status, retryable: res.status === 429 || res.status >= 500 },
      );
    }

    const data = (await res.json()) as OllamaResponse;
    return data.message?.content ?? '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const text = await withRetry(
      (signal) =>
        this.complete(
          `Generate a product tour. Prompt: ${prompt || 'Overview tour.'}. DOM: ${JSON.stringify(context)}. Return: { "steps": [{ "id", "target"?, "placement"?, "content": { "title", "body"? } }] }`,
          STEPS_SCHEMA.schema,
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
          `Events: ${JSON.stringify(events.slice(-20))}. Detect intent. Return: { "type": "confused"|"stuck"|"exploring"|"engaged", "confidence": 0-1, "element"? }`,
          INTENT_SCHEMA.schema,
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
          `Question: "${question}". URL: ${context.url}. DOM: ${JSON.stringify(context.dom)}. Return: { "text", "highlights": [], "confidence"? }`,
          ANSWER_SCHEMA.schema,
          signal,
        ),
      this.req,
    );
    return parseModelJson(
      text,
      validateGuidedAnswer,
      { text: 'Unable to answer.', highlights: [] },
      warnUnparseable('answerQuestion'),
    );
  }
}
