---
description: Get started with GuideFlow.js in minutes. Quick-start examples for Vanilla JS, React, Vue and Svelte. Create your first product tour with just a few lines of code.
keywords: GuideFlow quick start, product tour tutorial, guided tour example React Vue Svelte
---

# Quick Start

## Vanilla JS

```ts
import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles'; // built-in CSS

const gf = createGuideFlow();

gf.start({
  id: 'welcome',
  steps: [
    {
      id: 'step-1',
      title: '👋 Welcome!',
      body: 'This is your dashboard. Let us show you around.',
      target: '#sidebar',
      placement: 'right',
    },
    {
      id: 'step-2',
      title: 'Your profile',
      body: 'Click here to update your settings.',
      target: '[data-testid="profile-btn"]',
      placement: 'bottom',
    },
  ],
});
```

## React

```tsx
// 1. Wrap your app
import { TourProvider } from '@guideflow/react';
import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles';

const gf = createGuideFlow();

export function App() {
  return (
    <TourProvider instance={gf}>
      <YourApp />
    </TourProvider>
  );
}

// 2. Start a tour from anywhere
import { useGuideFlow } from '@guideflow/react';

function OnboardingButton() {
  const gf = useGuideFlow();
  return (
    <button onClick={() => gf.start({ id: 'welcome', steps: [...] })}>
      Start Tour
    </button>
  );
}
```

## AI-generated tour

```ts
import { createGuideFlow } from '@guideflow/core';
import { createAI, OpenAIProvider } from '@guideflow/ai';

const gf = createGuideFlow();
createAI(new OpenAIProvider(), gf);

// Generate steps from the current page DOM
const steps = await gf.ai.generate('Walk me through the checkout flow');
gf.start({ id: 'ai-tour', steps });
```

## CLI

```bash
# Scaffold configuration files
npx @guideflow/cli init

# Launch the visual tour builder
npx @guideflow/cli studio

# Export a flow to JSON
npx @guideflow/cli export my-tour.ts

# Publish to GuideFlow Cloud
npx @guideflow/cli push my-tour.flow.json --api-key YOUR_KEY
```
