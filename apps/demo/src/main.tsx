/* eslint-disable no-console */
import { createAI, MockProvider } from '@guideflow/ai'
import {
  AnalyticsCollector,
  WebhookTransport,
  type AnalyticsEvent,
  type AnalyticsTransport,
} from '@guideflow/analytics'
import { createBanners } from '@guideflow/banner'
import { mountBanner } from '@guideflow/banner/widget'
import { createGuideFlow, LocalStorageDriver } from '@guideflow/core'
import { TourProvider } from '@guideflow/react'
import { createSurveys } from '@guideflow/survey'
import { mountSurvey } from '@guideflow/survey/widget'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'

// ---------------------------------------------------------------------------
// 1. GuideFlow instance — with full config
// ---------------------------------------------------------------------------
const gf = createGuideFlow({
  debug: true,
  persistence: {
    driver: new LocalStorageDriver(),
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  context: { userId: 'demo-user', roles: ['user'], featureFlags: { newUI: true } },
  spotlight: { animated: true, overlayOpacity: 0.55 },
})

// Register French and Spanish i18n locales so the i18n demo section can switch live
gf.i18n.register('fr', {
  next: 'Suivant', prev: 'Précédent', close: 'Fermer',
  skip: 'Passer le tour', done: 'Terminé',
  stepOf: 'Étape {current} sur {total}',
  openHint: 'Ouvrir l\'astuce', closeHint: 'Fermer l\'astuce',
})
gf.i18n.register('es', {
  next: 'Siguiente', prev: 'Atrás', close: 'Cerrar',
  skip: 'Saltar tour', done: 'Listo',
  stepOf: 'Paso {current} de {total}',
  openHint: 'Abrir pista', closeHint: 'Cerrar pista',
})
gf.i18n.register('zh', {
  next: '下一步', prev: '上一步', close: '关闭',
  skip: '跳过引导', done: '完成',
  stepOf: '第 {current} / {total} 步',
  openHint: '打开提示', closeHint: '关闭提示',
})

// ---------------------------------------------------------------------------
// 2. Analytics — multiple transports
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

// In-memory buffer transport — the App reads this to render the transport log
export const capturedEvents: AnalyticsEvent[] = []
const bufferTransport: AnalyticsTransport = {
  name: 'in-memory-buffer',
  track(event: AnalyticsEvent): void {
    capturedEvents.push(event)
    // Flush oldest when buffer grows beyond 200
    if (capturedEvents.length > 200) capturedEvents.shift()
  },
}

export const collector = new AnalyticsCollector({
  userId: 'demo-user',
  globalProperties: { app: 'guideflow-demo', version: '0.1.0' },
})
collector.addTransport(consoleTransport)
collector.addTransport(bufferTransport)

// WebhookTransport — only registered in production to avoid 405 errors from
// the Vite dev server which has no /api/analytics POST handler.
if (import.meta.env.PROD) {
  const webhookTransport = new WebhookTransport({
    url: '/api/analytics',  // replace with a real endpoint in production
  })
  collector.addTransport(webhookTransport)
}

collector.attach(gf)

// ---------------------------------------------------------------------------
// 3. AI — attach MockProvider
// ---------------------------------------------------------------------------
const gfWithAI = createAI(new MockProvider(), gf, { intentDebounceMs: 1500 })

// ---------------------------------------------------------------------------
// 3b. The docked surfaces — a banner and an NPS survey
//
// Both are host-wired into the SAME collector the tour events go to, which is
// the whole point of their `onEvent` seam: neither package depends on
// @guideflow/analytics, and neither puts anything on the TourEvents bus, so a
// banner dismissal never lands in the tour funnel alongside people abandoning a
// tour.
//
// Mounted here rather than in a React effect because the controllers are
// instance-scoped, exactly like the collector above. The widgets are imperative
// DOM by design — the controllers are `subscribe`/`getSnapshot`, so a host that
// wants to render its own can ignore the widget subpath entirely.
// ---------------------------------------------------------------------------
export const banners = createBanners(gf, [
  {
    id: 'demo-v2',
    title: 'GuideFlow 0.2 is out',
    body: 'Docked banners, NPS surveys and an MCP server for authoring tours.',
    actions: [
      { label: 'Show me', variant: 'primary', flowId: 'onboardingFlow' },
      { label: 'Not now', dismisses: true },
    ],
  },
], {
  onEvent: (event) => {
    console.log('[banner]', event.type, event)
    collector.track(`guideflow.banner.${event.type}`, { ...event })
  },
})

export const surveys = createSurveys(gf, [
  {
    id: 'demo-nps',
    question: 'How likely are you to recommend GuideFlow to a colleague?',
    scale: { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' },
    followUp: { label: 'What is the main reason for your score?', placeholder: 'Optional' },
    thanks: 'Thank you — that goes straight to the collector below.',
    // 90 days in production; one minute here so the demo is re-runnable.
    targeting: { cooldownMs: 60_000 },
  },
], {
  onEvent: (event) => {
    console.log('[survey]', event.type, event)
    collector.track(`guideflow.survey.${event.type}`, { ...event })
  },
})

// `bottom-start`: `mountSurvey` defaults to `bottom-end`, which is also
// `mountChecklist`'s default. Neither package can detect the other, so the
// corner is the host's problem to allocate — and this is the demo of that.
mountBanner(banners, { dock: 'top' })
mountSurvey(surveys, { dock: 'bottom-start' })

// ---------------------------------------------------------------------------
// 4. Expose window.__guideflow so @guideflow/devtools extension can detect it.
//    The content script injected by the extension watches for this property.
// ---------------------------------------------------------------------------
;(window as Window & { __guideflow?: unknown }).__guideflow = gfWithAI

// ---------------------------------------------------------------------------
// 4. Mount React tree
// ---------------------------------------------------------------------------
const container = document.getElementById('root')!
createRoot(container).render(
  <React.StrictMode>
    <TourProvider instance={gfWithAI}>
      <App
        instance={gfWithAI}
        collector={collector}
        capturedEvents={capturedEvents}
        banners={banners}
        surveys={surveys}
      />
    </TourProvider>
  </React.StrictMode>,
)
