// ---------------------------------------------------------------------------
// AI Response Validation
// Validates JSON responses from LLM providers to ensure type safety
// ---------------------------------------------------------------------------

import type { Step, StepContent, IntentSignal, GuidedAnswer, PopoverPlacement } from '@guideflow/core';

/**
 * Validates that a parsed JSON value looks like a Step array.
 * Ensures each element has at minimum an `id` and `content` or body/title.
 */
export function validateSteps(parsed: unknown): Step[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>)['id'] === 'string'
      );
    })
    .map((item) => {
      const content: StepContent = {
        ...(typeof item['title'] === 'string' ? { title: item['title'] } : {}),
        ...(typeof item['body'] === 'string' ? { body: item['body'] } : { body: '' }),
      };

      const step: Step = {
        id: item['id'] as string,
        content,
      };

      // Preserve target if valid
      if (typeof item['target'] === 'string') {
        step.target = item['target'];
      }

      // Preserve placement if valid
      const validPlacements: readonly string[] = [
        'top', 'top-start', 'top-end',
        'bottom', 'bottom-start', 'bottom-end',
        'left', 'left-start', 'left-end',
        'right', 'right-start', 'right-end',
        'center',
      ] as const;
      if (typeof item['placement'] === 'string' && validPlacements.includes(item['placement'])) {
        step.placement = item['placement'] as PopoverPlacement;
      }

      return step;
    });
}

/**
 * Validates that a parsed JSON value looks like an IntentSignal.
 */
export function validateIntentSignal(parsed: unknown): IntentSignal {
  const fallback: IntentSignal = { type: 'exploring', confidence: 0 };

  if (typeof parsed !== 'object' || parsed === null) return fallback;

  const obj = parsed as Record<string, unknown>;

  const validTypes: readonly IntentSignal['type'][] = ['confused', 'stuck', 'exploring', 'engaged'];

  // Accept either `type` or `intent` as the type field (LLMs may return either)
  const rawType = typeof obj['type'] === 'string'
    ? obj['type']
    : typeof obj['intent'] === 'string'
      ? obj['intent']
      : 'exploring';

  const type: IntentSignal['type'] = (validTypes as readonly string[]).includes(rawType)
    ? rawType as IntentSignal['type']
    : 'exploring';

  const confidence = typeof obj['confidence'] === 'number'
    ? Math.max(0, Math.min(1, obj['confidence']))
    : 0;

  const result: IntentSignal = { type, confidence };

  if (typeof obj['element'] === 'string') {
    result.element = obj['element'];
  }

  return result;
}

/**
 * Validates that a parsed JSON value looks like a GuidedAnswer.
 */
export function validateGuidedAnswer(parsed: unknown): GuidedAnswer {
  const fallback: GuidedAnswer = { text: 'Sorry, I could not answer that.', highlights: [] };

  if (typeof parsed !== 'object' || parsed === null) return fallback;

  const obj = parsed as Record<string, unknown>;

  const text = typeof obj['text'] === 'string'
    ? obj['text']
    : typeof obj['answer'] === 'string'
      ? obj['answer']
      : fallback.text;

  const highlights: string[] = [];
  if (typeof obj['highlightSelector'] === 'string') {
    highlights.push(obj['highlightSelector']);
  }
  if (Array.isArray(obj['highlights'])) {
    for (const h of obj['highlights']) {
      if (typeof h === 'string') highlights.push(h);
    }
  }

  return {
    text,
    highlights,
    ...(typeof obj['confidence'] === 'number' ? { confidence: obj['confidence'] } : {}),
  };
}
