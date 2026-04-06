/* eslint-disable no-console */
import { createAI, MockProvider } from '@guideflow/ai'
import { AnalyticsCollector, type AnalyticsEvent, type AnalyticsTransport } from '@guideflow/analytics'
import { createGuideFlow } from '@guideflow/core'
import { GuidePopover, TourProvider } from '@guideflow/react'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'

// ---------------------------------------------------------------------------
// 1. Create GuideFlow instance with debug logging
// ---------------------------------------------------------------------------
const gf = createGuideFlow({ debug: true })

// ---------------------------------------------------------------------------
// 2. Analytics — console transport (logs every event; replace with PostHog/etc)
// ---------------------------------------------------------------------------
const consoleTransport: AnalyticsTransport = {
  name: 'console',
  track(event: AnalyticsEvent): void {
    console.group(`[Analytics] ${event.event}`)
    console.log('timestamp :', event.timestamp)
    console.log('properties:', event.properties)
    console.groupEnd()
  },
}

const collector = new AnalyticsCollector({ userId: 'demo-user', globalProperties: { app: 'guideflow-demo' } })
collector.addTransport(consoleTransport)
collector.attach(gf)

// ---------------------------------------------------------------------------
// 3. AI — attach MockProvider so ConversationalPanel works without an API key
// ---------------------------------------------------------------------------
const gfWithAI = createAI(new MockProvider(), gf)

// ---------------------------------------------------------------------------
// 4. Mount React tree
// ---------------------------------------------------------------------------
const container = document.getElementById('root')!
createRoot(container).render(
  <React.StrictMode>
    <TourProvider instance={gfWithAI}>
      <App instance={gfWithAI} collector={collector} />
      {/* GuidePopover renders the spotlight popover for the active step */}
      <GuidePopover />
    </TourProvider>
  </React.StrictMode>,
)
