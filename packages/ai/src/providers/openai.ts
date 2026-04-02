/**
 * OpenAI provider for @guideflow/ai.
 * Requires `openai` peer dependency: `npm i openai`.
 *
 * The provider is deliberately lazy — it only imports `openai` inside each
 * method so the package compiles and tree-shakes correctly even when the
 * peer dep is absent.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';
import type { AIProvider, PageContext } from './interface.js';

export interface OpenAIProviderOptions {
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
  private opts: Required<OpenAIProviderOptions>;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.opts = {
      apiKey: opts.apiKey ?? (typeof process !== 'undefined' ? process.env['OPENAI_API_KEY'] ?? '' : ''),
      model: opts.model ?? 'gpt-4o-mini',
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens ?? 2048,
    };
  }

  private async client() {
    // Lazy import so the package works without openai installed at compile time
    const { default: OpenAI } = await import('openai').catch(() => {
      throw new Error(
        '[@guideflow/ai] OpenAI peer dependency not found. Run: npm i openai',
      );
    });
    return new OpenAI({ apiKey: this.opts.apiKey });
  }

  private async complete(userContent: string): Promise<string> {
    const openai = await this.client();
    const response = await openai.chat.completions.create({
      model: this.opts.model,
      temperature: this.opts.temperature,
      max_tokens: this.opts.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });
    return response.choices[0]?.message?.content ?? '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const content = await this.complete(
      `Generate a product tour as a JSON array of steps.
Prompt: ${prompt || 'Create an overview tour of the page.'}
DOM snapshot (compact): ${JSON.stringify(context)}
Return format: [{ id, title, body, target?, placement? }]`,
    );
    try {
      const parsed: unknown = JSON.parse(content);
      return Array.isArray(parsed) ? (parsed as Step[]) : [];
    } catch {
      return [];
    }
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    const content = await this.complete(
      `Given this list of user events, detect the user's intent.
Events: ${JSON.stringify(events.slice(-20))}
Return format: { intent: string, confidence: number, suggestedFlowId?: string }`,
    );
    try {
      return JSON.parse(content) as IntentSignal;
    } catch {
      return { type: 'exploring' as const, confidence: 0 };
    }
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    const content = await this.complete(
      `Answer this user question about the current page.
Question: ${question}
Page URL: ${context.url}
Page title: ${context.title}
DOM (compact): ${JSON.stringify(context.dom)}
Return format: { answer: string, highlightSelector?: string, confidence: number }`,
    );
    try {
      return JSON.parse(content) as GuidedAnswer;
    } catch {
      return { text: 'Sorry, I could not answer that.', highlights: [], };
    }
  }
}
