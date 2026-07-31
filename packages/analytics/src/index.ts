/**
 * @guideflow/analytics
 *
 * @author  John Mugabe
 * @country Zimbabwe
 * @github  https://github.com/RealNerdZW
 * @license MIT
 *
 * Copyright (c) 2026 John Mugabe. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root.
 *
 * Analytics collection, A/B testing, and event transport for GuideFlow.js.
 *
 * Usage:
 * ```ts
 * import { createGuideFlow } from '@guideflow/core';
 * import {
 *   AnalyticsCollector,
 *   PostHogTransport,
 *   WebhookTransport,
 *   ExperimentEngine,
 * } from '@guideflow/analytics';
 *
 * const gf = createGuideFlow({ ... });
 *
 * const collector = new AnalyticsCollector({ userId: 'user-123' })
 *   .addTransport(new PostHogTransport())
 *   .addTransport(new WebhookTransport({ url: '/api/analytics' }));
 *
 * collector.attach(gf);
 *
 * // A/B: assign a variant, run the flow it names, record the exposure.
 * const engine = new ExperimentEngine('user-123');
 * await startVariant(gf, engine, {
 *   id: 'onboarding-shape',
 *   variants: [
 *     { id: 'control',   value: shortOnboardingFlow },
 *     { id: 'treatment', value: longOnboardingFlow },
 *   ],
 * }, { collector });
 * ```
 *
 * This docstring used to show `createGuideFlow({ theme })`, which has never
 * type-checked, and then said applying the variant was "application code" —
 * which was true, and was the bug. `startVariant` is the glue.
 */

export { AnalyticsCollector } from './collector.js';
export { PrivacyPolicy } from './privacy.js';
export type { PrivacyOptions } from './privacy.js';
export type { CollectorOptions } from './collector.js';

export type { AnalyticsEvent, AnalyticsTransport } from './transports/interface.js';
export { PostHogTransport } from './transports/posthog.js';
export { MixpanelTransport } from './transports/mixpanel.js';
export { AmplitudeTransport } from './transports/amplitude.js';
export { SegmentTransport } from './transports/segment.js';
export { WebhookTransport } from './transports/webhook.js';
export type { WebhookTransportOptions } from './transports/webhook.js';

export { ExperimentEngine } from './experiments.js';
export { startVariant, EXPERIMENT_EXPOSED_EVENT } from './start-variant.js';
export type { VariantFlow, StartVariantOptions } from './start-variant.js';
export type { Variant, Experiment, ExperimentResult } from './experiments.js';
