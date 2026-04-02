// ---------------------------------------------------------------------------
// Broadcast Sync
// Cross-tab progress synchronisation via BroadcastChannel API
// ---------------------------------------------------------------------------

import type { FlowSnapshot, TourEvents } from '../types/index.js'
import { EventEmitter } from '../utils/emitter.js'
import { isBrowser } from '../utils/ssr.js'

const CHANNEL_NAME = 'guideflow:progress'

interface BroadcastMessage {
  type: 'snapshot' | 'dismiss' | 'complete'
  userId: string
  flowId: string
  snapshot?: FlowSnapshot
}

export class BroadcastSync extends EventEmitter<Pick<TourEvents, 'progress:sync'>> {
  private _channel: BroadcastChannel | null = null
  private _userId: string

  constructor(userId: string) {
    super()
    this._userId = userId
    this._connect()
  }

  private _connect(): void {
    if (!isBrowser() || typeof BroadcastChannel === 'undefined') return
    this._channel = new BroadcastChannel(CHANNEL_NAME)
    this._channel.addEventListener('message', (e: MessageEvent<BroadcastMessage>) => {
      const msg = e.data
      if (msg.userId !== this._userId) return
      if (msg.type === 'snapshot' && msg.snapshot) {
        this.emit('progress:sync', { snapshot: msg.snapshot })
      }
    })
  }

  broadcast(message: Omit<BroadcastMessage, 'userId'>): void {
    this._channel?.postMessage({ ...message, userId: this._userId })
  }

  destroy(): void {
    this._channel?.close()
    this._channel = null
    this.removeAllListeners()
  }
}
