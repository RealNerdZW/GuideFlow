import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';
import type { AIProvider, PageContext } from './interface.js';

/**
 * Deterministic mock provider suitable for unit tests, demoing, and offline
 * development.  Responses are generated from the supplied DOM/event data so
 * outputs are stable across repeated calls with the same input.
 */
export class MockProvider implements AIProvider {
  private delay: number;

  /** @param delay - artificial latency in ms (default 120) */
  constructor(delay = 120) {
    this.delay = delay;
  }

  private async sleep(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.delay));
  }

  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    await this.sleep();

    // Derive fake step count from element count (1–5)
    const count = Math.min(5, Math.max(1, context.elements.length));

    return Array.from({ length: count }, (_, i) => {
      const el = context.elements[i];
      const placements = ['bottom', 'top', 'right', 'left'] as const;
      const step: Step = {
        id: `mock-step-${i + 1}`,
        content: {
          title: el ? `Step ${i + 1}: ${el.label ?? el.role}` : `Step ${i + 1}`,
          body:
            i === 0
              ? `Welcome! ${prompt || 'Let us walk you through this page.'}`
              : `This is step ${i + 1}. Selector: ${el?.selector ?? 'n/a'}.`,
        },
        ...(el?.selector ? { target: el.selector } : {}),
        placement: placements[i % 4]!,
      };
      return step;
    });
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    await this.sleep();

    const last = events[events.length - 1];
    return {
      type: 'exploring',
      confidence: 0.75,
      ...(last?.target ? { element: last.target.replace(/[^a-z0-9]/gi, '-') } : {}),
    };
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    await this.sleep();

    return {
      text: `[Mock] You asked: "${question}". You are currently on ${context.url}.`,
      highlights: context.dom.elements[0]?.selector ? [context.dom.elements[0].selector] : [],
    };
  }
}
