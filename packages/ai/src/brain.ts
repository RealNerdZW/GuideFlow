import type { Step, UserEvent, IntentSignal, GuidedAnswer, GuideFlowInstance } from '@guideflow/core';
import { isBrowser } from '@guideflow/core';

import { serializeDOM } from './dom-context.js';
import type { AIProvider, PageContext } from './providers/interface.js';

export interface GuideBrainOptions {
  /**
   * How many milliseconds of user inactivity before intent detection fires
   * (default: 2000ms).
   */
  intentDebounceMs?: number;
  /**
   * Maximum number of user events to buffer before the oldest ones are
   * discarded (default: 200).
   */
  maxEventBuffer?: number;
  /**
   * If true, GuideBrain will automatically watch for user events and emit
   * intent signals (default: false — call watch() manually).
   */
  autoWatch?: boolean;
  /**
   * How many *new* events must accumulate before a detection call is worth
   * making (default: 5).
   *
   * Without this a single stray scroll followed by a 2s lull bought a full LLM
   * round trip. Every one of the caps below exists for the same reason: `push()`
   * ran on every click, input, keydown and scroll, and each lull issued a call
   * with no floor, no cooldown and no ceiling (AUDIT `uncapped-llm-calls-per-pause`).
   */
  minEventsBeforeDetect?: number;
  /**
   * Minimum gap between two automatic detection calls, regardless of how much
   * the user does in between (default: 30_000ms).
   */
  detectCooldownMs?: number;
  /**
   * Hard ceiling on automatic detection calls for the life of this instance
   * (default: 20). Reached, watching continues but stops calling the provider.
   * Explicit `detectIntent()` calls are never capped — those are yours.
   */
  maxDetectsPerSession?: number;
}

export type BrainEventMap = {
  'intent:detected': IntentSignal;
  'steps:generated': Step[];
  'answer:ready': GuidedAnswer;
  error: Error;
};

type BrainListener<K extends keyof BrainEventMap> = (payload: BrainEventMap[K]) => void;

/**
 * GuideBrain orchestrates all AI interactions for a GuideFlow instance.
 *
 * Responsibilities:
 *   - generate()  — create steps from the live DOM + a developer prompt
 *   - watch()     — passively monitor user events, fire intent signals
 *   - compress()  — adaptively skip steps the user has already mastered
 *   - chat()      — answer free-form user questions about the current page
 */
export class GuideBrain {
  private provider: AIProvider;
  private opts: Required<GuideBrainOptions>;
  private eventBuffer: UserEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanups: Array<() => void> = [];
  private listeners = new Map<string, Set<BrainListener<keyof BrainEventMap>>>();
  /** Prevents duplicate DOM event listeners when watch() is called multiple times. */
  private _watching = false;
  /** Events already sent to the provider — the floor for `minEventsBeforeDetect`. */
  private _analysedCount = 0;
  private _lastDetectAt = 0;
  private _autoDetectCount = 0;
  /** Aborts calls still in flight when destroy() runs. */
  private _inflight: AbortController | null = null;
  private _destroyed = false;

  constructor(provider: AIProvider, opts: GuideBrainOptions = {}) {
    this.provider = provider;
    this.opts = {
      intentDebounceMs: opts.intentDebounceMs ?? 2000,
      maxEventBuffer: opts.maxEventBuffer ?? 200,
      autoWatch: opts.autoWatch ?? false,
      minEventsBeforeDetect: opts.minEventsBeforeDetect ?? 5,
      detectCooldownMs: opts.detectCooldownMs ?? 30_000,
      maxDetectsPerSession: opts.maxDetectsPerSession ?? 20,
    };

    if (this.opts.autoWatch) {
      this.watch();
    }
  }

  /**
   * What the automatic detection loop has spent so far.
   * Exposed so an app can surface or budget it rather than guess.
   */
  get stats(): { autoDetects: number; bufferedEvents: number; analysedEvents: number } {
    return {
      autoDetects: this._autoDetectCount,
      bufferedEvents: this.eventBuffer.length,
      analysedEvents: this._analysedCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Typed mini-emitter
  // ---------------------------------------------------------------------------

  on<K extends keyof BrainEventMap>(event: K, listener: BrainListener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as BrainListener<keyof BrainEventMap>);
    return () => set.delete(listener as BrainListener<keyof BrainEventMap>);
  }

  private emit<K extends keyof BrainEventMap>(event: K, payload: BrainEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((fn) => {
        try {
          (fn as BrainListener<K>)(payload);
        } catch (e) {
          console.error('[GuideBrain] listener error', e);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // generate — build a tour from the live DOM
  // ---------------------------------------------------------------------------

  /**
   * Capture the current DOM, send it to the AI provider, and return
   * generated steps.
   *
   * @param prompt - optional natural language description for the tour
   * @param root   - root element to serialize (defaults to document.body)
   */
  async generate(prompt = '', root?: Element | null): Promise<Step[]> {
    const context = serializeDOM(root);
    try {
      const steps = await this.provider.generateSteps(context, prompt);
      this.emit('steps:generated', steps);
      return steps;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // watch — passive intent detection
  // ---------------------------------------------------------------------------

  /**
   * Start listening for user interactions. Debounces and then calls
   * `provider.detectIntent()` when the user pauses.
   */
  watch(): () => void {
    if (!isBrowser()) return () => {};
    // Guard against duplicate listener accumulation on repeated calls
    if (this._watching) {
      // Return a no-op cleanup; caller that originally called watch() still holds the real cleanup
      return () => {};
    }
    this._watching = true;

    const push = (type: UserEvent['type'], target: string) => {
      const event: UserEvent = {
        type,
        target,
        timestamp: Date.now(),
      };
      this.eventBuffer.push(event);
      if (this.eventBuffer.length > this.opts.maxEventBuffer) {
        this.eventBuffer.shift();
        // The high-water mark indexes into a buffer that just lost its head, so
        // it has to slide too or `minEventsBeforeDetect` drifts permanently out
        // of range and detection stops firing at all.
        if (this._analysedCount > 0) this._analysedCount--;
      }
      this.scheduleDetect();
    };

    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el) push('click', buildShallowSelector(el));
    };

    const onInput = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el) push('focus', buildShallowSelector(el));
    };

    const onScroll = () => push('scroll', 'window');
    const onKeydown = (e: KeyboardEvent) => push('keydown', e.key);

    document.addEventListener('click', onClick, { passive: true });
    document.addEventListener('input', onInput, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKeydown, { passive: true });

    const cleanup = () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('input', onInput);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKeydown);
      this._watching = false;
    };

    this.cleanups.push(cleanup);
    return cleanup;
  }

  private scheduleDetect(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // `.catch`, not `void`. detectIntent() re-throws after emitting 'error',
      // and `void` discards the promise without attaching a rejection handler —
      // so an expired key, a rate limit or a network blip turned every automatic
      // detection into an unhandled rejection, which crashes a Node process
      // outright (AUDIT `brain-unhandled-rejection`). The error has already
      // reached anyone listening by the time we get here.
      this._autoDetect().catch(() => { /* already emitted on 'error' */ });
    }, this.opts.intentDebounceMs);
  }

  /**
   * The rate-limited path the watcher uses. Every gate here is about money and
   * quota: `detectIntent()` itself stays uncapped because an explicit call is
   * the caller's decision, not ours.
   */
  private async _autoDetect(): Promise<void> {
    if (this._destroyed) return;

    const fresh = this.eventBuffer.length - this._analysedCount;
    if (fresh < this.opts.minEventsBeforeDetect) return;

    if (this._autoDetectCount >= this.opts.maxDetectsPerSession) return;

    const now = Date.now();
    if (now - this._lastDetectAt < this.opts.detectCooldownMs) return;

    this._lastDetectAt = now;
    this._autoDetectCount++;
    // Mark before the await: a second lull during an in-flight call must not
    // count the same events again.
    this._analysedCount = this.eventBuffer.length;

    await this.detectIntent();
  }

  /**
   * Run intent detection now, ignoring the debounce and every automatic cap.
   *
   * Throws on provider failure *and* emits `error` first, so a caller who
   * awaits this sees the failure and a passive listener still gets told.
   */
  async detectIntent(): Promise<IntentSignal> {
    const events = [...this.eventBuffer];
    this._inflight?.abort();
    const controller = new AbortController();
    this._inflight = controller;

    try {
      const signal = await this.provider.detectIntent(events);
      if (controller.signal.aborted) {
        // destroy() ran while this was in flight. Emitting now would fire a
        // listener the caller believes they have already torn down.
        throw new Error('[@guideflow/ai] Intent detection cancelled');
      }
      this.emit('intent:detected', signal);
      return signal;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!controller.signal.aborted) this.emit('error', error);
      throw error;
    } finally {
      if (this._inflight === controller) this._inflight = null;
    }
  }

  // ---------------------------------------------------------------------------
  // compress — adaptive step skipping
  // ---------------------------------------------------------------------------

  /**
   * Given a list of tour steps and a GuideFlow instance (for checking
   * persistence state), remove steps the user has already demonstrated
   * proficiency with.
   *
   * @param steps    - full list of steps to potentially compress
   * @param instance - the active GuideFlow instance
   * @param userId   - optional userId for persistence lookup (supply this to
   *                   enable per-user completion checks via ProgressStore)
   */
  async compress(steps: Step[], instance: GuideFlowInstance, userId?: string): Promise<Step[]> {
    // Strategy: ask AI which steps can be skipped given current intent signals
    // and the user's past interactions. Falls back to returning all steps if AI fails.
    const events = [...this.eventBuffer];
    try {
      const signal = await this.provider.detectIntent(events);
      const intentType = signal.type;

      const filtered: Step[] = [];
      for (const step of steps) {
        // Skip steps whose flow was already completed (persistence check)
        if (userId) {
          const completed = await instance.progress.isCompleted(userId, `step:${step.id}`);
          if (completed) continue;
        }
        // If AI detected high confidence, skip introductory steps
        if (signal.confidence > 0.8 && intentType !== 'confused' && step.id.includes('intro')) continue;
        filtered.push(step);
      }
      return filtered;
    } catch {
      return steps;
    }
  }

  // ---------------------------------------------------------------------------
  // chat — answer free-form user questions
  // ---------------------------------------------------------------------------

  /**
   * Answer a natural language question from the user.
   * Automatically captures the current page context.
   */
  async chat(question: string, root?: Element | null): Promise<GuidedAnswer> {
    const dom = serializeDOM(root);
    const context: PageContext = {
      url: isBrowser() ? window.location.href : '',
      title: isBrowser() ? document.title : '',
      dom,
    };

    try {
      const answer = await this.provider.answerQuestion(question, context);
      this.emit('answer:ready', answer);
      return answer;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  /** Flush all buffered events. */
  clearBuffer(): void {
    this.eventBuffer = [];
    this._analysedCount = 0;
  }

  /** Stop watching and clean up all listeners. */
  destroy(): void {
    this._destroyed = true;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    // Cancel work already in flight, so a slow provider cannot resolve into a
    // torn-down instance and emit to listeners the caller has released.
    this._inflight?.abort();
    this._inflight = null;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.listeners.clear();
  }
}

/** Build a minimal selector for an element (<tag>#<id> or <tag>.<first-class>). */
function buildShallowSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const first = el.classList[0];
  if (first) return `${tag}.${first}`;
  return tag;
}
