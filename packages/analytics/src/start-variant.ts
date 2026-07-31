/**
 * The missing three lines between "assign a variant" and "a different tour runs".
 *
 * `ExperimentEngine` has always assigned variants deterministically, and
 * `Variant<T>` has always been generic — so `value` could always have been a
 * whole `FlowDefinition`. What did not exist was any way to act on the result
 * and record that the user saw it, and neither the module docstring here nor
 * the A/B docs page described anything that type-checked (AUDIT
 * `experiment-variant-cannot-affect-any-tour`).
 *
 * This lives in `@guideflow/analytics`, not in core: the most powerful thing a
 * variant can change is *which flow runs*, and that needs no engine support at
 * all. Zero bytes reach `@guideflow/core`, and this package keeps importing
 * core by type only.
 */
import type { FlowDefinition, GuidanceContext, GuideFlowInstance } from '@guideflow/core';

import type { AnalyticsCollector } from './collector.js';
import type { Experiment, ExperimentEngine, ExperimentResult } from './experiments.js';

/** A variant value `gf.start()` accepts: an inline flow, or a registered flow id. */
export type VariantFlow<TContext extends GuidanceContext = GuidanceContext> =
  | FlowDefinition<TContext>
  | string;

export interface StartVariantOptions<TContext extends GuidanceContext = GuidanceContext> {
  /** Collector used to emit the exposure event. Omit it and no event is sent. */
  collector?: AnalyticsCollector;
  context?: TContext;
  /** Merged into the exposure event, spread last so it wins. */
  properties?: Record<string, unknown>;
}

export const EXPERIMENT_EXPOSED_EVENT = 'guideflow.experiment.exposed';

/**
 * Assign `experiment`, start the assigned flow, and record the exposure.
 *
 * ```ts
 * const engine = new ExperimentEngine(userId);
 * await startVariant(gf, engine, {
 *   id: 'onboarding-shape',
 *   variants: [
 *     { id: 'control',   value: shortFlow },
 *     { id: 'treatment', value: longFlow },
 *   ],
 * }, { collector });
 * ```
 *
 * Returns `null` — starting nothing and emitting nothing — in two cases:
 *
 * 1. **A tour is already running.** `TourEngine.start()` begins by ending any
 *    active tour, which emits `tour:abandon`; that would be recorded as the
 *    user giving up on a tour they never chose to leave.
 * 2. **`gf.start()` declined.** It returns without starting for an unknown flow
 *    id, a dismissed flow, or a completed one. Exposure is only recorded for
 *    users who actually saw a tour — otherwise the denominator of every
 *    experiment is wrong.
 */
export async function startVariant<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  engine: ExperimentEngine,
  experiment: Experiment<VariantFlow<TContext>>,
  options: StartVariantOptions<TContext> = {},
): Promise<ExperimentResult<VariantFlow<TContext>> | null> {
  if (gf.isActive) {
    console.warn(
      '[@guideflow/analytics] startVariant(): a tour is already running, so nothing was started. ' +
        'Call gf.stop() first if replacing it is what you meant.',
    );
    return null;
  }

  const result = engine.assign(experiment);
  await gf.start(result.value, options.context);

  // `_active` is set before the render is awaited, so this is a valid read the
  // moment start() resolves.
  if (!gf.isActive) return null;

  options.collector?.track(EXPERIMENT_EXPOSED_EVENT, {
    experiment_id: result.experimentId,
    variant_id: result.variantId,
    // Read from the instance, not from the variant value — the value may be a
    // flow id string, and this way it is always the flow that actually ran.
    flow_id: gf.flowId ?? undefined,
    ...options.properties,
  });

  return result;
}
