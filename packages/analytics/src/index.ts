/**
 * @guideflow/analytics
 *
 * @author  John Mugabe
 * @email   jonesmugabe@263tickets.co.zw
 * @country Zimbabwe
 * @github  https://github.com/johnmugabe
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
 * // A/B assignment
 * const engine = new ExperimentEngine('user-123');
 * const { value: theme } = engine.assign({
 *   id: 'tour-theme',
 *   variants: [
 *     { id: 'control', value: 'minimal' },
 *     { id: 'treatment', value: 'bold' },
 *   ],
 * });
 * const gf2 = createGuideFlow({ theme });
 * ```
 */

export { AnalyticsCollector } from './collector.js';
export type { CollectorOptions } from './collector.js';

export type { AnalyticsEvent, AnalyticsTransport } from './transports/interface.js';
export { PostHogTransport } from './transports/posthog.js';
export { MixpanelTransport } from './transports/mixpanel.js';
export { AmplitudeTransport } from './transports/amplitude.js';
export { SegmentTransport } from './transports/segment.js';
export { WebhookTransport } from './transports/webhook.js';
export type { WebhookTransportOptions } from './transports/webhook.js';

export { ExperimentEngine } from './experiments.js';
export type { Variant, Experiment, ExperimentResult } from './experiments.js';
