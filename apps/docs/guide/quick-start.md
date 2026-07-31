---
description: Get started with GuideFlow.js in minutes. Quick-start examples for Vanilla JS and React. Create your first product tour with a real FlowDefinition.
keywords: GuideFlow quick start, product tour tutorial, guided tour example React Vue Svelte
---

# Quick Start

Every tour is a **flow**: a small state machine of the shape
`{ id, initial, states }`. There is no flat `{ id, steps }` form — passing one
throws, because `FlowMachine` validates that `initial` names a real state.

See [Flows & Steps](/guide/flows-and-steps) for the full shape.

## Vanilla JS

```ts
import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles'; // built-in CSS

const gf = createGuideFlow();

await gf.start({
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'step-1',
          content: { title: '👋 Welcome!', body: 'This is your dashboard. Let us show you around.' },
          target: '#sidebar',
          placement: 'right',
        },
        {
          id: 'step-2',
          content: { title: 'Your profile', body: 'Click here to update your settings.' },
          target: '[data-testid="profile-btn"]',
          placement: 'bottom',
        },
      ],
      final: true,
    },
  },
});
```

Step text lives under `content`, not on the step itself: `content` is a
`StepContent` (`{ title?, body?, html? }`) or a function returning one.

## React

```tsx
// 1. Wrap your app
import { createGuideFlow } from '@guideflow/core';
import { TourProvider } from '@guideflow/react';
import '@guideflow/core/styles';

const gf = createGuideFlow();

export function App() {
  return (
    <TourProvider instance={gf}>
      <YourApp />
    </TourProvider>
  );
}
```

```tsx
// 2. Start a tour from anywhere
import type { FlowDefinition } from '@guideflow/core';
import { useGuideFlow } from '@guideflow/react';

const welcomeFlow: FlowDefinition = {
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        { id: 'step-1', content: { title: '👋 Welcome!' }, target: '#sidebar' },
      ],
      final: true,
    },
  },
};

function OnboardingButton() {
  const gf = useGuideFlow();
  return (
    <button onClick={() => void gf.start(welcomeFlow)}>
      Start Tour
    </button>
  );
}
```

`TourProvider` takes either an `instance` you created yourself or a `config`
object it uses to create one.

## AI-generated tour

The AI layer is a separate package. In the browser, use `ProxyProvider` and keep
the model API key on your own server — see
[Running AI on your server](/guide/ai-proxy).

```ts
import { createGuideFlow } from '@guideflow/core';
import { createAI, ProxyProvider } from '@guideflow/ai';

// createAI returns the same instance, typed with `.ai`
const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
);

// Generate steps from the current page DOM
const steps = await gf.ai.generate('Walk me through the checkout flow');

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
});
```

## CLI

```bash
# Scaffold configuration files
npx @guideflow/cli init

# Serve your project with Vite and flag the page for the DevTools extension
npx @guideflow/cli studio

# Read a flow file (.ts, .js or .json) and write it out as JSON
npx @guideflow/cli export my-tour.ts --output my-tour.flow.json

# POST a flow JSON file to an HTTP endpoint you control
npx @guideflow/cli push my-tour.flow.json \
  --endpoint https://example.com/api/flows \
  --api-key "$GUIDEFLOW_API_KEY"
```

`studio` needs Vite, which is an optional peer dependency — install it in your
project (`pnpm add -D vite`) if you do not already have it. It binds
`127.0.0.1` by default; pass `--host` to expose it.
