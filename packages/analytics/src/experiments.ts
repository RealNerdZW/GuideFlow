/**
 * Deterministic A/B experiment engine.
 *
 * Variant assignment is derived from a hash of `userId + experimentId`, so the
 * same user always gets the same variant with no server round-trip.
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

/**
 * Number of buckets assignments are spread over.
 *
 * A large fixed space rather than `totalWeight`. Bucketing directly by
 * `hash % totalWeight` meant a two-arm experiment used `hash % 2` — a single
 * bit of the hash — and see {@link hashToBucket} for why that was catastrophic.
 * 10_000 also gives weights a useful resolution: 0.01% is expressible.
 */
const BUCKETS = 10_000;

/**
 * FNV-1a with a murmur3 finalisation step.
 *
 * **This replaced a bare djb2, and the reason matters.** Assignment used to be
 * `djb2(userId + ':' + experimentId) % totalWeight`, which for the common
 * two-arm case is `% 2` — the low bit of djb2. That bit is the parity of the
 * XOR chain over the input's char codes, so changing only the experiment id
 * shifts it by a constant: two experiments are either *always* the same arm or
 * *always* opposite.
 *
 * Measured over 10 000 synthetic ids before the fix:
 *
 * | pair | agreement |
 * |---|---|
 * | `exp-one` vs `exp-two` | 100.0% |
 * | `tour-theme-2024` vs `cta-experiment` | 0.0% |
 *
 * The marginal split of each experiment was a clean 50/50, which is exactly why
 * this survived: every obvious test passes. Only the *joint* distribution is
 * degenerate — and a user in the treatment arm of every concurrent experiment
 * makes the results of all of them uninterpretable.
 *
 * FNV-1a mixes better on its own, and the finaliser avalanches the low bits so
 * no single bit of the output is a simple function of the input. Closes AUDIT
 * `experiment-correlation`.
 */
function hashToBucket(str: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // The FNV prime, via imul so the multiply stays in 32-bit integer space.
    h = Math.imul(h, 0x01000193);
  }

  // murmur3 fmix32 — the avalanche step. Without it the low bits still carry
  // too much structure for a small modulus.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return (h >>> 0) % BUCKETS;
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

    const totalWeight = experiment.variants.reduce(
      (sum, v) => sum + (v.weight ?? 1),
      0,
    );

    // Bucket over the fixed space, then scale weights into it — never
    // `hash % totalWeight`, which collapses a two-arm experiment onto one bit.
    const bucket = hashToBucket(`${this.userId}:${experiment.id}`);

    let cumulative = 0;
    let chosen: Variant<T> = experiment.variants[0];
    for (const variant of experiment.variants) {
      cumulative += (variant.weight ?? 1) / totalWeight;
      if (bucket < cumulative * BUCKETS) {
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
