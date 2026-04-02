import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core';

/**
 * Compact page context passed to answerQuestion — a subset of DOMContext
 * enriched with the current tour state when available.
 */
export interface PageContext {
  url: string;
  title: string;
  /** Serialized interactive elements on the page. */
  dom: DOMContext;
  /** Current tour step id, if a tour is active. */
  currentStepId?: string;
}

/**
 * The primary abstraction every concrete AI provider must implement.
 * All methods return Promises so every provider can be async.
 */
export interface AIProvider {
  /**
   * Generate an ordered list of tour steps from a serialized DOM snapshot
   * and an optional natural-language prompt from the developer.
   */
  generateSteps(context: DOMContext, prompt: string): Promise<Step[]>;

  /**
   * Inspect a stream of recent user interaction events and return an intent
   * signal describing what the user is likely trying to do.
   */
  detectIntent(events: UserEvent[]): Promise<IntentSignal>;

  /**
   * Answer a free-form question from the user given the current page context.
   * The response may include an optional `highlightSelector` that points to the
   * relevant element on the page.
   */
  answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer>;
}
