// ---------------------------------------------------------------------------
// Typed Event Emitter — zero-dependency, ~50 lines
// ---------------------------------------------------------------------------

type Listener<T> = (event: T) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<TEvents extends Record<string, any>> {
  private _listeners = new Map<keyof TEvents, Set<Listener<unknown>>>()

  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    const set = this._listeners.get(event)!
    set.add(listener as Listener<unknown>)
    return () => this.off(event, listener)
  }

  once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
    const wrapper: Listener<TEvents[K]> = (e) => {
      listener(e)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
    this._listeners.get(event)?.delete(listener as Listener<unknown>)
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    this._listeners.get(event)?.forEach((fn) => fn(payload))
  }

  removeAllListeners(event?: keyof TEvents): void {
    if (event) {
      this._listeners.delete(event)
    } else {
      this._listeners.clear()
    }
  }
}
