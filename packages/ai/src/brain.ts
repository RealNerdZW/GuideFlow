import type { Step, UserEvent, IntentSignal, GuidedAnswer, GuideFlowInstance } from '@guideflow/core';
import { isBrowser } from '@guideflow/core';
import type { AIProvider, PageContext } from './providers/interface.js';
import { serializeDOM } from './dom-context.js';

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

  constructor(provider: AIProvider, opts: GuideBrainOptions = {}) {
    this.provider = provider;
    this.opts = {
      intentDebounceMs: opts.intentDebounceMs ?? 2000,
      maxEventBuffer: opts.maxEventBuffer ?? 200,
      autoWatch: opts.autoWatch ?? false,
    };

    if (this.opts.autoWatch) {
      this.watch();
    }
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

    const push = (type: UserEvent['type'], target: string) => {
      const event: UserEvent = {
        type,
        target,
        timestamp: Date.now(),
      };
      this.eventBuffer.push(event);
      if (this.eventBuffer.length > this.opts.maxEventBuffer) {
        this.eventBuffer.shift();
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
    };

    this.cleanups.push(cleanup);
    return cleanup;
  }

  private scheduleDetect(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.detectIntent();
    }, this.opts.intentDebounceMs);
  }

  async detectIntent(): Promise<IntentSignal> {
    const events = [...this.eventBuffer];
    try {
      const signal = await this.provider.detectIntent(events);
      this.emit('intent:detected', signal);
      return signal;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // compress — adaptive step skipping
  // ---------------------------------------------------------------------------

  /**
   * Given a list of tour steps and a GuideFlow instance (for checking
   * persistence state), remove steps the user has already demonstrated
   * proficiency with.
   */
  async compress(steps: Step[], instance: GuideFlowInstance): Promise<Step[]> {
    // Strategy: ask AI which steps can be skipped given current intent signals
    // and the user's past interactions. Falls back to returning all steps if AI fails.
    const events = [...this.eventBuffer];
    try {
      const signal = await this.provider.detectIntent(events);
      const intentType = signal.type;

      const filtered: Step[] = [];
      for (const step of steps) {
        // Skip steps whose flow was already completed (persistence check)
        const userId = (instance as any)._config?.context?.userId as string | undefined;
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
  }

  /** Stop watching and clean up all listeners. */
  destroy(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
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
