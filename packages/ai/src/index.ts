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
export { serializeDOM } from './dom-context.js';
export { validateSteps, validateIntentSignal, validateGuidedAnswer } from './validation.js';

import type { GuideFlowInstance } from '@guideflow/core';

import { GuideBrain } from './brain.js';
import type { GuideBrainOptions } from './brain.js';
import type { AIProvider } from './providers/interface.js';

/**
 * Attach AI capabilities to an existing GuideFlow instance.
 *
 * After calling this function, the instance gains an `.ai` property that
 * exposes the full GuideBrain API.
 *
 * @param provider - the AI backend to use (OpenAI, Anthropic, Ollama, Mock, …)
 * @param instance - the GuideFlow instance to augment
 * @param opts     - tuning options for the GuideBrain
 * @returns        the same `instance` reference (mutated), typed with `.ai`
 */
export function createAI<T extends GuideFlowInstance>(
  provider: AIProvider,
  instance: T,
  opts?: GuideBrainOptions,
): T & { ai: GuideBrain } {
  const brain = new GuideBrain(provider, opts);

  const augmented = instance as T & { ai: GuideBrain };
  augmented.ai = brain;

  // Wire brain destruction to the instance lifecycle
  const origDestroy = instance.destroy.bind(instance);
  (instance as { destroy: () => void }).destroy = () => {
    brain.destroy();
    origDestroy();
  };

  return augmented;
}
