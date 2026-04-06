/* eslint-disable no-console */
import { createAI, MockProvider } from '@guideflow/ai'
import {
  AnalyticsCollector,
  WebhookTransport,
  type AnalyticsEvent,
  type AnalyticsTransport,
} from '@guideflow/analytics'
import { createGuideFlow, LocalStorageDriver } from '@guideflow/core'
import { GuidePopover, TourProvider } from '@guideflow/react'
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

// WebhookTransport — will 404 in demo, but demonstrates the transport chain
const webhookTransport = new WebhookTransport({
  url: '/api/analytics',  // replace with a real endpoint in production
})

export const collector = new AnalyticsCollector({
  userId: 'demo-user',
  globalProperties: { app: 'guideflow-demo', version: '0.1.0' },
})
collector.addTransport(consoleTransport)
collector.addTransport(bufferTransport)
collector.addTransport(webhookTransport)
collector.attach(gf)

// ---------------------------------------------------------------------------
// 3. AI — attach MockProvider
// ---------------------------------------------------------------------------
const gfWithAI = createAI(new MockProvider(), gf, { intentDebounceMs: 1500 })

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
      <App instance={gfWithAI} collector={collector} capturedEvents={capturedEvents} />
      <GuidePopover />
    </TourProvider>
  </React.StrictMode>,
)
