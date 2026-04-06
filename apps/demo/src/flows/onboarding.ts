import type { FlowDefinition, StepAction } from '@guideflow/core'

// ---------------------------------------------------------------------------
// Demo context (used for role-based FSM branching)
// ---------------------------------------------------------------------------
export interface DemoContext {
  role?: 'admin' | 'user'
  completedSetup?: boolean
}

// ---------------------------------------------------------------------------
// 1. Onboarding — 5-state flow, one step per demo section.
//    Demonstrates: target, placement, padding, scrollIntoView, meta, actions.
// ---------------------------------------------------------------------------
export const onboardingFlow: FlowDefinition = {
  id: 'demo-onboarding',
  initial: 'welcome',
  states: {
    welcome: {
      steps: [
        {
          id: 'welcome-header',
          target: '#gf-header',
          placement: 'bottom',
          content: {
            title: '👋 Welcome to GuideFlow',
            body: 'This demo exercises every major feature across all @guideflow/* packages.',
          },
          padding: 10,
          scrollIntoView: true,
          meta: { category: 'intro', priority: 'high' },
        },
      ],
      on: { NEXT: 'tours' },
    },
    tours: {
      steps: [
        {
          id: 'tours-section',
          target: '#gf-tours',
          placement: 'bottom-start',
          content: {
            title: '🎯 Tours & State Machine',
            body: 'Multi-state FSM with guard transitions. showIf conditional steps. Custom StepAction buttons.',
          },
          padding: 4,
          scrollIntoView: true,
          meta: { category: 'feature' },
        },
      ],
      on: { NEXT: 'hotspots', PREV: 'welcome' },
    },
    hotspots: {
      steps: [
        {
          id: 'hotspots-section',
          target: '#gf-hotspots',
          placement: 'top',
          content: {
            title: '📍 Hotspots & Hints',
            body: 'Beacons highlight features in context. Hints show numbered badges. Both declarative & programmatic.',
          },
          scrollIntoView: true,
          meta: { category: 'feature' },
        },
      ],
      on: { NEXT: 'ai', PREV: 'tours' },
    },
    ai: {
      steps: [
        {
          id: 'ai-section',
          target: '#gf-ai',
          placement: 'top',
          content: {
            title: '🤖 AI Features',
            body: 'Generate tours from a prompt + live DOM. Answer user questions. Detect intent signals.',
          },
          scrollIntoView: true,
          meta: { category: 'ai' },
        },
      ],
      on: { NEXT: 'analytics', PREV: 'hotspots' },
    },
    analytics: {
      steps: [
        {
          id: 'analytics-section',
          target: '#gf-analytics',
          placement: 'top',
          content: {
            title: '📊 Analytics & A/B Testing',
            body: 'Every event flows through AnalyticsCollector. ExperimentEngine assigns variants deterministically.',
          },
          scrollIntoView: true,
          actions: [
            { label: 'Finish Tour \u2713', variant: 'primary', action: 'end' } as StepAction,
            { label: '\u2190 Back', variant: 'secondary', action: 'prev' } as StepAction,
          ],
          meta: { category: 'analytics' },
        },
      ],
      on: { PREV: 'ai' },
      final: true,
    },
  },
}

// ---------------------------------------------------------------------------
// 2. FSM Branch flow — guard-based routing demo.
//    Demonstrates: FlowTransition.guard, onEntry callbacks, context mutation.
// ---------------------------------------------------------------------------
export const fsmBranchFlow: FlowDefinition<DemoContext> = {
  id: 'demo-fsm-branch',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'fsm-intro',
          target: '#gf-tours',
          placement: 'bottom',
          content: {
            title: '🔀 FSM Guard Demo',
            body: 'Pick a role (Admin / User) below then press "Admin Path" or "User Path". The guard on NEXT routes you to a different state.',
          },
          padding: 6,
        },
      ],
      on: {
        NEXT:      { target: 'admin-path', guard: (ctx) => ctx.role === 'admin' },
        NEXT_USER: 'user-path',
      },
      onEntry: (ctx) => { ctx.completedSetup = false },
    },
    'admin-path': {
      steps: [
        {
          id: 'fsm-admin',
          target: '#gf-config',
          placement: 'top',
          content: {
            title: '🔑 Admin Path',
            body: 'Guard matched (role === "admin"). You were routed to Config.',
          },
          scrollIntoView: true,
        },
      ],
      on: { NEXT: 'fsm-done', PREV: 'intro' },
    },
    'user-path': {
      steps: [
        {
          id: 'fsm-user',
          target: '#gf-hotspots',
          placement: 'top',
          content: {
            title: '👤 User Path',
            body: 'Guard did not match; NEXT_USER event routed you here instead.',
          },
          scrollIntoView: true,
        },
      ],
      on: { NEXT: 'fsm-done', PREV: 'intro' },
    },
    'fsm-done': {
      steps: [
        {
          id: 'fsm-complete',
          target: '#gf-tours',
          placement: 'bottom',
          content: {
            title: '\u2705 Paths Converge',
            body: 'Both admin and user paths end here. The guard transition worked.',
          },
          meta: { finalStep: true },
        },
      ],
      on: {},
      final: true,
      onEntry: (ctx) => { ctx.completedSetup = true },
    },
  },
}

// ---------------------------------------------------------------------------
// 3. showIf conditional flow.
//    Demonstrates the visited-Set fix: step-b is always hidden, tour must not
//    loop or end prematurely.
// ---------------------------------------------------------------------------
export const conditionalFlow: FlowDefinition = {
  id: 'demo-conditional',
  initial: 'step-a',
  states: {
    'step-a': {
      steps: [
        {
          id: 'step-a',
          target: '#gf-header',
          placement: 'bottom',
          content: { title: 'Step A', body: 'Always visible. Hit Next \u2014 Step B is silently skipped by showIf.' },
          showIf: () => true,
        },
      ],
      on: { NEXT: 'step-b' },
    },
    'step-b': {
      steps: [
        {
          id: 'step-b-hidden',
          target: '#gf-tours',
          placement: 'right',
          content: { title: 'Step B \u2014 Hidden', body: 'You should NEVER see this.' },
          showIf: () => false,
        },
      ],
      on: { NEXT: 'step-c' },
    },
    'step-c': {
      steps: [
        {
          id: 'step-c',
          target: '#gf-hotspots',
          placement: 'top',
          content: { title: 'Step C \u2713', body: 'Step B was silently skipped. The visited-set loop fix works.' },
        },
      ],
      on: {},
      final: true,
    },
  },
}

// ---------------------------------------------------------------------------
// 4. Custom-actions flow — per-step StepAction[] override.
//    Demonstrates: custom button labels, ghost variant, FSM event dispatch.
// ---------------------------------------------------------------------------
export const customActionsFlow: FlowDefinition = {
  id: 'demo-custom-actions',
  initial: 'ca-p1',
  states: {
    'ca-p1': {
      steps: [
        {
          id: 'ca-p1',
          target: '#gf-tours',
          placement: 'bottom',
          content: { title: '🎮 Custom Actions', body: '"Jump to End" sends FSM event "END", bypassing page 2.' },
          actions: [
            { label: 'Next \u2192', variant: 'primary', action: 'next' } as StepAction,
            { label: 'Jump to End', variant: 'ghost', action: 'END' } as unknown as StepAction,
          ],
        },
      ],
      on: { NEXT: 'ca-p2', END: 'ca-p3' },
    },
    'ca-p2': {
      steps: [
        {
          id: 'ca-p2',
          target: '#gf-ai',
          placement: 'top',
          content: { title: 'Page 2', body: 'Normal next/back. Or press Finish.' },
          actions: [
            { label: '\u2190 Back', variant: 'secondary', action: 'prev' } as StepAction,
            { label: 'Finish', variant: 'primary', action: 'next' } as StepAction,
          ],
          scrollIntoView: true,
        },
      ],
      on: { NEXT: 'ca-p3', PREV: 'ca-p1' },
    },
    'ca-p3': {
      steps: [
        {
          id: 'ca-final',
          target: '#gf-analytics',
          placement: 'top',
          content: { title: '🏁 Done!', body: 'Custom actions tour complete.' },
          actions: [{ label: 'Close', variant: 'primary', action: 'end' } as StepAction],
          scrollIntoView: true,
        },
      ],
      on: {},
      final: true,
    },
  },
}
