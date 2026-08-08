/**
 * @guideflow/ai
 *
 * @author  John Mugabe
 * @country Zimbabwe
 * @github  https://github.com/RealNerdZW
 * @license MIT
 *
 * Copyright (c) 2026 John Mugabe. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root.
 *
 * AI-powered intelligence layer for GuideFlow.js.
 *
 * Usage:
 * ```ts
 * import { createGuideFlow } from '@guideflow/core';
 * import { createAI, ProxyProvider } from '@guideflow/ai';
 *
 * // ProxyProvider holds no credential — your endpoint keeps the key. Keep
 * // createAI's return value: it is the binding typed with `.ai`.
 * const gf = createAI(
 *   new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
 *   createGuideFlow(),
 * );
 *
 * // generate() returns Step[] — assemble the flow yourself.
 * const steps = await gf.ai.generate('Walk me through checkout');
 * await gf.start({ id: 'checkout', initial: 'main', states: { main: { steps, final: true } } });
 *
 * const answer = await gf.ai.chat('How do I add a promo code?');
 * console.log(answer.text, answer.highlights);
 * ```
 */

export type { AIProvider, PageContext } from './providers/interface.js';
// ProxyProvider first: it is the one to reach for in a browser. Every provider
// below it holds an API key, which in client code is public by construction.
export { ProxyProvider } from './providers/proxy.js';
export type { ProxyProviderOptions } from './providers/proxy.js';
export { MockProvider } from './providers/mock.js';
export { OpenAIProvider } from './providers/openai.js';
export type { OpenAIProviderOptions } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export type { AnthropicProviderOptions } from './providers/anthropic.js';
export { OllamaProvider } from './providers/ollama.js';
export type { OllamaProviderOptions } from './providers/ollama.js';
export { GuideBrain } from './brain.js';
export type { GuideBrainOptions, BrainEventMap } from './brain.js';
export {
  parseModelJson,
  stripCodeFences,
  extractJsonValue,
  unwrapSteps,
  STEPS_SCHEMA,
  INTENT_SCHEMA,
  ANSWER_SCHEMA,
} from './json.js';
export type { JsonSchemaSpec } from './json.js';
export { withRetry, composeSignal, ProviderRequestError } from './request.js';
export type { RequestOptions } from './request.js';
export { serializeDOM } from './dom-context.js';
export { validateSteps, validateIntentSignal, validateGuidedAnswer } from './validation.js';

import type { FlowDefinition, GuideFlowInstance, IntentSignal } from '@guideflow/core';

import { GuideBrain } from './brain.js';
import type { GuideBrainOptions } from './brain.js';
import type { AIProvider } from './providers/interface.js';

/**
 * A rule that turns a detected intent into a tour.
 *
 * `intent:detected` used to be emitted and connected to nothing — README.md and
 * the intent guide both promised "automatically surfacing the right tour at the
 * right moment", and `createAI` wired only `destroy`
 * (AUDIT `intent-never-wired-to-flows`). This is the missing half.
 */
export interface IntentTrigger {
  /** Which signal fires this rule. */
  type: IntentSignal['type'];
  /**
   * Floor on the model's self-reported confidence. Default 0.7.
   *
   * A floor matters more than it looks: a failed detection falls back to
   * `{ type: 'exploring', confidence: 0 }`, so any rule on `exploring` with a
   * threshold of 0 would fire on every provider error.
   */
  minConfidence?: number;
  /** The tour to start. */
  flow: FlowDefinition;
  /**
   * Fire at most once per instance (default: true).
   *
   * A tour that reopens every time the user looks confused *at* the tour is a
   * loop, not a feature.
   */
  once?: boolean;
}

export interface CreateAIOptions extends GuideBrainOptions {
  /**
   * Start a tour when an intent is detected. Opt-in and empty by default —
   * nothing auto-starts a tour unless you ask for it.
   *
   * Triggers are evaluated in order and the first match wins, so put the
   * specific ones first.
   */
  intentTriggers?: IntentTrigger[];
}

/**
 * Attach AI capabilities to an existing GuideFlow instance.
 *
 * After calling this function, the instance gains an `.ai` property that
 * exposes the full GuideBrain API.
 *
 * @param provider - the AI backend to use (OpenAI, Anthropic, Ollama, Mock, …)
 * @param instance - the GuideFlow instance to augment
 * @param opts     - tuning options for the GuideBrain, plus optional intent triggers
 * @returns        the same `instance` reference (mutated), typed with `.ai`
 *
 * @example Auto-start a help tour when the user looks stuck
 * ```ts
 * const gf = createAI(new ProxyProvider({ endpoint: '/api/ai' }), createGuideFlow(), {
 *   autoWatch: true,
 *   intentTriggers: [{ type: 'stuck', minConfidence: 0.8, flow: helpFlow }],
 * });
 * ```
 */
export function createAI<T extends GuideFlowInstance>(
  provider: AIProvider,
  instance: T,
  opts?: CreateAIOptions,
): T & { ai: GuideBrain } {
  const brain = new GuideBrain(provider, opts);

  const augmented = instance as T & { ai: GuideBrain };
  augmented.ai = brain;

  const triggers = opts?.intentTriggers ?? [];
  let unsubscribeIntent: (() => void) | undefined;

  if (triggers.length > 0) {
    const fired = new Set<string>();

    unsubscribeIntent = brain.on('intent:detected', (signal) => {
      // Never interrupt a tour that is already on screen. The user is being
      // guided; a second tour replacing it mid-step is worse than no help.
      if (instance.isActive) return;

      for (const trigger of triggers) {
        if (trigger.type !== signal.type) continue;
        if (signal.confidence < (trigger.minConfidence ?? 0.7)) continue;
        if ((trigger.once ?? true) && fired.has(trigger.flow.id)) continue;

        fired.add(trigger.flow.id);
        // start() is async and this listener is not — swallow rather than leak
        // an unhandled rejection, and say why on the console.
        void Promise.resolve(instance.start(trigger.flow)).catch((err: unknown) => {
          console.error('[@guideflow/ai] intent trigger failed to start a tour', err);
        });
        return;
      }
    });
  }

  // Wire brain destruction to the instance lifecycle
  const origDestroy = instance.destroy.bind(instance);
  (instance as { destroy: () => void }).destroy = () => {
    unsubscribeIntent?.();
    brain.destroy();
    origDestroy();
  };

  return augmented;
}
