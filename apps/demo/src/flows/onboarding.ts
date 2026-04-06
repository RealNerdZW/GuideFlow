import type { FlowDefinition } from '@guideflow/core'

/**
 * A fully-typed 3-step onboarding FlowDefinition.
 *
 * Steps use correct FlowDefinition schema:
 *   - `initial` — first state key
 *   - `states`  — map of state id → { steps, on, final? }
 *   - `on`      — FSM transitions (NEXT / PREV)
 *   - `showIf`  — conditional step rendering
 *   - `meta`    — arbitrary metadata per step
 */
export const onboardingFlow: FlowDefinition = {
  id: 'demo-onboarding',
  initial: 'welcome',
  states: {
    welcome: {
      steps: [
        {
          id: 'welcome-header',
          target: '#demo-header',
          placement: 'bottom',
          content: {
            title: '👋 Welcome to GuideFlow Demo',
            body: 'This demo exercises every major feature of @guideflow/core and @guideflow/react.',
          },
          meta: { category: 'intro' },
        },
      ],
      on: { NEXT: 'features' },
    },
    features: {
      steps: [
        {
          id: 'features-section',
          target: '#features',
          placement: 'right',
          content: {
            title: '✨ Features Section',
            body: 'Here you can see tours, hotspots, AI chat, and analytics all working together.',
          },
          meta: { category: 'feature-highlight' },
        },
      ],
      on: { NEXT: 'analytics', PREV: 'welcome' },
    },
    analytics: {
      steps: [
        {
          id: 'analytics-section',
          target: '#analytics-log',
          placement: 'top',
          content: {
            title: '📊 Analytics',
            body: 'Every tour event is forwarded to AnalyticsCollector. Check the console and the log below.',
          },
          meta: { category: 'analytics-demo' },
        },
      ],
      on: { PREV: 'features' },
      final: true,
    },
  },
}

/**
 * A second flow to test showIf conditional stepping.
 */
export const conditionalFlow: FlowDefinition = {
  id: 'demo-conditional',
  initial: 'step-a',
  states: {
    'step-a': {
      steps: [
        {
          id: 'step-a',
          target: '#demo-header',
          placement: 'bottom',
          content: { title: 'Step A', body: 'Always visible.' },
          // This step never gets skipped — showIf always true
          showIf: () => true,
        },
      ],
      on: { NEXT: 'step-b' },
    },
    'step-b': {
      steps: [
        {
          id: 'step-b-hidden',
          target: '#features',
          placement: 'right',
          content: { title: 'Step B — Hidden', body: 'You should never see this.' },
          // This step is always hidden — tests the showIf skip loop fix
          showIf: () => false,
        },
      ],
      on: { NEXT: 'step-c' },
    },
    'step-c': {
      steps: [
        {
          id: 'step-c',
          target: '#analytics-log',
          placement: 'top',
          content: { title: 'Step C', body: 'Step B was skipped! The showIf loop fix works.' },
        },
      ],
      on: {},
      final: true,
    },
  },
}
