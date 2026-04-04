/**
 * Ollama provider for @guideflow/ai.
 * Talks to a locally running Ollama instance via its HTTP API.
 * Zero additional dependencies — uses the built-in Fetch API.
 */
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

import { validateSteps, validateIntentSignal, validateGuidedAnswer } from '../validation.js';

import type { AIProvider, PageContext } from './interface.js';

export interface OllamaProviderOptions {
  /** Base URL of the Ollama server. Default: http://localhost:11434 */
  baseUrl?: string;
  /** Model name to use. Default: llama3 */
  model?: string;
}

interface OllamaResponse {
  message: { content: string };
}

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(opts: OllamaProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = opts.model ?? 'llama3';
  }

  private async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You are GuideFlow, an AI that generates product tour JSON. Respond with valid JSON only — no prose, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`[@guideflow/ai] Ollama request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return data.message?.content ?? '{}';
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    const text = await this.complete(
      `Generate a product tour. Prompt: ${prompt || 'Overview tour.'}. DOM: ${JSON.stringify(context)}. Return: [{ id, title, body, target?, placement? }]`,
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
      `Events: ${JSON.stringify(events.slice(-20))}. Detect intent. Return: { intent, confidence, suggestedFlowId? }`,
    );
    try {
      return validateIntentSignal(JSON.parse(text));
    } catch {
      return { type: 'exploring' as const, confidence: 0 };
    }
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    const text = await this.complete(
      `Question: "${question}". URL: ${context.url}. DOM: ${JSON.stringify(context.dom)}. Return: { answer, highlightSelector?, confidence }`,
    );
    try {
      return validateGuidedAnswer(JSON.parse(text));
    } catch {
      return { text: 'Unable to answer.', highlights: [] };
    }
  }
}
