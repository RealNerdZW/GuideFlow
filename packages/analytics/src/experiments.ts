/**
 * Deterministic A/B experiment engine.
 *
 * Variant assignment is derived from a simple djb2 hash of
 * `userId + experimentId` so the same user always gets the same variant —
 * no server round-trip required.
 */

export interface Variant<T = string> {
  id: string;
  value: T;
  /** Relative weight for this variant (default: 1). */
  weight?: number;
}

export interface Experiment<T = string> {
  id: string;
  variants: [Variant<T>, ...Variant<T>[]]; // at least one variant required
}

export interface ExperimentResult<T = string> {
  experimentId: string;
  variantId: string;
  value: T;
}

/** djb2 — fast, deterministic, no crypto needed for A/B bucketing. */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash >>>= 0; // keep unsigned 32-bit
  }
  return hash;
}

/**
 * ExperimentEngine — assign users to variants deterministically.
 *
 * ```ts
 * const engine = new ExperimentEngine('user-abc123');
 * const result = engine.assign({
 *   id: 'checkout-tour-style',
 *   variants: [
 *     { id: 'control', value: 'minimal' },
 *     { id: 'treatment', value: 'bold' },
 *   ],
 * });
 * // result.value === 'minimal' | 'bold' (stable for this userId)
 * ```
 */
export class ExperimentEngine {
  private userId: string;
  private cache = new Map<string, ExperimentResult<unknown>>();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Assign (or recall a cached assignment for) `userId` to a variant of
   * `experiment`.
   */
  assign<T>(experiment: Experiment<T>): ExperimentResult<T> {
    const cached = this.cache.get(experiment.id) as ExperimentResult<T> | undefined;
    if (cached) return cached;

    // Build a cumulative weight array
    const totalWeight = experiment.variants.reduce(
      (sum, v) => sum + (v.weight ?? 1),
      0,
    );

    const hash = djb2(`${this.userId}:${experiment.id}`);
    const bucket = hash % totalWeight;

    let cumulative = 0;
    let chosen: Variant<T> = experiment.variants[0];
    for (const variant of experiment.variants) {
      cumulative += variant.weight ?? 1;
      if (bucket < cumulative) {
        chosen = variant;
        break;
      }
    }

    const result: ExperimentResult<T> = {
      experimentId: experiment.id,
      variantId: chosen.id,
      value: chosen.value,
    };

    this.cache.set(experiment.id, result as ExperimentResult<unknown>);
    return result;
  }

  /** Check which variant a user is in without caching the result. */
  peek<T>(experiment: Experiment<T>): ExperimentResult<T> {
    // Temporarily remove any cached assignment so assign() recomputes
    const existing = this.cache.get(experiment.id);
    this.cache.delete(experiment.id);
    const result = this.assign(experiment);
    // Restore original cache entry (peek should not modify cache state)
    if (existing) {
      this.cache.set(experiment.id, existing);
    } else {
      this.cache.delete(experiment.id);
    }
    return result;
  }

  /** Clear all cached assignments (useful when userId changes). */
  reset(): void {
    this.cache.clear();
  }

  /** Change the userId and reset all assignments. */
  setUserId(userId: string): void {
    this.userId = userId;
    this.reset();
  }
}
