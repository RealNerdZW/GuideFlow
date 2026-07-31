// Types for flows.js, which is plain JavaScript so the browser can load it from
// the static server with no build step. Declared here so both the Playwright
// specs and packages/core's fixture-guard unit test get real types.

import type { FlowDefinition } from '@guideflow/core'

export declare const basic: FlowDefinition
export declare const final: FlowDefinition
export declare const scroll: FlowDefinition
export declare const persisted: FlowDefinition
export declare const multistate: FlowDefinition

export declare const flows: Record<string, FlowDefinition>
