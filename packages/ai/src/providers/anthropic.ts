/**
 * Anthropic (Claude) provider for @guideflow/ai.
 * Requires `@anthropic-ai/sdk` peer dependency.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

import { validateSteps, validateIntentSignal, validateGuidedAnswer } from '../validation.js';

import type { AIProvider, PageContext } from './interface.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Default: claude-3-haiku-20240307 (fastest + cheapest) */
  model?: string;
  maxTokens?: number;
}

const SYSTEM_PROMPT = `
You are GuideFlow, an AI assistant that helps developers create onboarding tours.
Always respond with valid JSON only — no prose, no markdown fences.
`.trim();

export class AnthropicProvider implements AIProvider {
  private opts: Required<AnthropicProviderOptions>;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.opts = {
      apiKey: opts.apiKey ?? (typeof process !== 'undefined' ? process.env['ANTHROPIC_API_KEY'] ?? '' : ''),
      model: opts.model ?? 'claude-3-haiku-20240307',
      maxTokens: opts.maxTokens ?? 2048,
    };
  }

  private async client() {
    const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => {
      throw new Error(
        '[@guideflow/ai] Anthropic peer dependency not found. Run: npm i @anthropic-ai/sdk',
      );
    });
    return new Anthropic({ apiKey: this.opts.apiKey });
  }

  private async complete(userContent: string): Promise<string> {
    const anthropic = await this.client();
    const response = await anthropic.messages.create({
      model: this.opts.model,
      max_tokens: this.opts.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
    const block = response.content[0];
    return block?.type === 'text' ? block.text : '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const text = await this.complete(
      `Generate a product tour as a JSON array of steps.
Prompt: ${prompt || 'Create an overview tour of the page.'}
DOM snapshot: ${JSON.stringify(context)}
Return format: [{ id, title, body, target?, placement? }]`,
    );
    try {
      const parsed: unknown = JSON.parse(text);
      return validateSteps(parsed);
    } catch {
      return [];
    }
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    const text = await this.complete(
      `Given these user events, detect intent.
Events: ${JSON.stringify(events.slice(-20))}
Return format: { intent: string, confidence: number, suggestedFlowId?: string }`,
    );
    try {
      return validateIntentSignal(JSON.parse(text));
    } catch {
      return { type: 'exploring' as const, confidence: 0 };
    }
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    const text = await this.complete(
      `Answer this user question.
Question: ${question}
URL: ${context.url} | Title: ${context.title}
DOM: ${JSON.stringify(context.dom)}
Return format: { answer: string, highlightSelector?: string, confidence: number }`,
    );
    try {
      return validateGuidedAnswer(JSON.parse(text));
    } catch {
      return { text: 'Sorry, I could not answer that.', highlights: [] };
    }
  }
}
