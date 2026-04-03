import type { Meta, StoryObj } from '@storybook/react';
import type { FlowDefinition } from '@guideflow/core';
import React from 'react';
import { createGuideFlow } from '@guideflow/core';
import { TourProvider, useTour } from '@guideflow/react';

const gf = createGuideFlow();

const DEMO_FLOW: FlowDefinition = {
  id: 'storybook-demo',
  initial: 'step-1',
  states: {
    'step-1': {
      steps: [{ id: 'step-1', content: { title: 'Welcome!', body: 'This is step 1.' }, target: '#box-a', placement: 'right' }],
      on: { NEXT: 'step-2' },
    },
    'step-2': {
      steps: [{ id: 'step-2', content: { title: 'Step 2', body: 'You are doing great.' }, target: '#box-b', placement: 'bottom' }],
      on: { NEXT: 'step-3', PREV: 'step-1' },
    },
    'step-3': {
      steps: [{ id: 'step-3', content: { title: 'Done!', body: 'Tour complete.' }, target: '#box-c', placement: 'left' }],
      on: {},
      final: true,
    },
  },
};

function TourControls() {
  const { isActive, currentStepIndex, totalSteps, next, prev, stop } = useTour();
  if (!isActive) return null;
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, background: '#6366f1', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>
      Step {currentStepIndex + 1}/{totalSteps}
      <button onClick={prev} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>◄</button>
      <button onClick={next} style={{ marginLeft: 4, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>►</button>
      <button onClick={stop} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
    </div>
  );
}

function DemoPage({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <button onClick={onStart} style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', width: 'fit-content' }}>
        Start Tour
      </button>
      <div id="box-a" style={{ padding: 24, border: '2px solid #e5e7eb', borderRadius: 8 }}>Box A</div>
      <div id="box-b" style={{ padding: 24, border: '2px solid #e5e7eb', borderRadius: 8 }}>Box B</div>
      <div id="box-c" style={{ padding: 24, border: '2px solid #e5e7eb', borderRadius: 8 }}>Box C</div>
      <TourControls />
    </div>
  );
}

const meta: Meta = {
  title: 'Core/TourFlow',
  decorators: [
    (Story) => (
      <TourProvider instance={gf}>
        <Story />
      </TourProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <DemoPage onStart={() => gf.start(DEMO_FLOW)} />,
};

export const ThemeMinimal: Story = {
  render: () => {
    const gfMinimal = createGuideFlow();
    return (
      <TourProvider instance={gfMinimal}>
        <DemoPage onStart={() => gfMinimal.start(DEMO_FLOW)} />
      </TourProvider>
    );
  },
};

export const ThemeBold: Story = {
  render: () => {
    const gfBold = createGuideFlow();
    return (
      <TourProvider instance={gfBold}>
        <DemoPage onStart={() => gfBold.start(DEMO_FLOW)} />
      </TourProvider>
    );
  },
};

export const ThemeGlass: Story = {
  render: () => {
    const gfGlass = createGuideFlow();
    return (
      <TourProvider instance={gfGlass}>
        <DemoPage onStart={() => gfGlass.start(DEMO_FLOW)} />
      </TourProvider>
    );
  },
};
