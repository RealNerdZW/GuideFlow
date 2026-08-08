import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

/**
 * The slice of Heap's API this transport uses.
 *
 * Deliberately a local type rather than the `declare global { interface Window
 * { heap?: … } }` block this file used to carry, for the same reason
 * `GA4Transport` avoids one — but with a sharper edge here. That declaration
 * asserted that `window.heap`, when present, has a callable `track`, and Heap's
 * own install snippet makes that false for the whole of page load: it installs
 * `window.heap = []` as a command stub and only replaces it once `heap.js`
 * arrives. So the declared type described the steady state and the code trusted
 * it during the one window where it does not hold.
 */
interface HeapApi {
  track: (event: string, props?: Record<string, unknown>) => void;
}

/**
 * Resolve `window.heap` only if it can actually take an event.
 *
 * Read lazily on every event so the Heap snippet may load before or after
 * GuideFlow, and — the part that is not just symmetry with the other vendor
 * transports — *shape-checked*, because "present" and "usable" are different
 * states here. `window.heap = []` is the documented first line of Heap's own
 * snippet, so a present-but-not-callable global is the normal condition during
 * page load rather than an exotic one, and calling into it threw a TypeError
 * that surfaced as a console warning per event from `AnalyticsCollector`.
 *
 * The object is returned rather than a bound `track`, so the call stays
 * `heap.track(…)` and `this` is whatever Heap expects.
 */
function getHeap(): HeapApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as { heap?: unknown }).heap;
  // `typeof null === 'object'`, hence the explicit null arm. An array passes
  // this and fails the next check, which is exactly the snippet-stub case.
  if (candidate === null || typeof candidate !== 'object') return undefined;
  return typeof (candidate as { track?: unknown }).track === 'function'
    ? (candidate as HeapApi)
    : undefined;
}

/**
 * How deep a nested value is followed before it is abandoned, counted in
 * property segments — `a.b.c.d` survives, anything under it does not.
 *
 * It is also what makes a cyclic object safe. `globalProperties` is host-
 * supplied and a self-referencing object there would otherwise walk forever,
 * taking the page with it. A depth cap costs one comparison and removes the
 * need for a seen-set.
 */
const MAX_DEPTH = 3;

/**
 * Heap stores only primitive property values. A nested object is not an error
 * and not a serialised string — it is dropped, with no diagnostic anywhere, so
 * `{ user: { plan: 'pro' } }` reaches Heap as nothing at all.
 *
 * Flattening it here into `user.plan` is the difference between that property
 * existing and not existing. `Date`, `Map` and `Set` are special-cased because
 * all three are objects with no own enumerable keys, so the generic walk would
 * drop them silently — exactly the failure this function exists to prevent.
 *
 * Every branded check goes through `Object.prototype.toString`, never
 * `instanceof`. `instanceof` compares against *this* realm's constructor, so a
 * `Date` created inside an iframe, or handed over by a cross-origin bridge, is
 * not `instanceof Date` here and would have fallen through to the generic walk
 * — which finds no enumerable keys and drops it. The brand travels with the
 * value; the constructor identity does not.
 */
function flattenInto(
  value: unknown,
  key: string,
  out: Record<string, string | number | boolean>,
  depth: number,
): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string' || typeof value === 'boolean') {
    out[key] = value;
    return;
  }
  // NaN and Infinity are numbers to `typeof` and are not JSON-representable.
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out[key] = value;
    return;
  }
  // function, symbol, bigint — nothing Heap can store.
  if (typeof value !== 'object') return;

  const tag = Object.prototype.toString.call(value);

  if (tag === '[object Date]') {
    const ms = (value as Date).getTime();
    // An invalid Date throws RangeError from toISOString. There is no honest
    // string for it, so it joins NaN in being dropped rather than sent.
    if (Number.isFinite(ms)) out[key] = (value as Date).toISOString();
    return;
  }

  if (depth >= MAX_DEPTH) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenInto(item, `${key}.${index}`, out, depth + 1));
    return;
  }

  // A Set is an array that lost its indices on the way in; give them back.
  if (tag === '[object Set]') {
    let index = 0;
    for (const item of value as Set<unknown>) {
      flattenInto(item, `${key}.${index}`, out, depth + 1);
      index += 1;
    }
    return;
  }

  if (tag === '[object Map]') {
    for (const [childKey, childValue] of value as Map<unknown, unknown>) {
      // Only a primitive key yields an unambiguous dotted name. An object key
      // stringifies to `[object Object]`, which would collide with every other
      // object key in the same Map, so those entries are dropped — and the
      // caller's one-time warning below reports it if nothing else survives.
      if (
        typeof childKey === 'string' ||
        typeof childKey === 'number' ||
        typeof childKey === 'boolean'
      ) {
        flattenInto(childValue, `${key}.${String(childKey)}`, out, depth + 1);
      }
    }
    return;
  }

  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    flattenInto(childValue, `${key}.${childKey}`, out, depth + 1);
  }
}

/**
 * Flatten the whole bag, reporting any top-level property that produced no
 * output key at all.
 *
 * `null` and `undefined` are not reported: those are absent values, not lost
 * ones. Everything else that vanishes here vanishes for a reason a caller
 * cannot see from Heap's UI — a `RegExp`, an `Error` (whose fields are
 * non-enumerable), a `WeakMap`, a `NaN`, a function — and a property that is
 * simply not there is the failure mode nobody can debug.
 */
function flattenProperties(
  properties: Record<string, unknown>,
  onDropped: (key: string) => void,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    const before = Object.keys(out).length;
    flattenInto(value, key, out, 0);
    if (Object.keys(out).length === before && value !== null && value !== undefined) {
      onDropped(key);
    }
  }
  return out;
}

/**
 * Heap transport. Accesses `window.heap` lazily, so the Heap snippet may load
 * before or after GuideFlow, and does nothing when it never loads — or when
 * what loaded is not yet callable.
 *
 * Unlike the other vendor transports this one rewrites the property bag:
 * nested values are flattened to dotted keys and values with no primitive form
 * are dropped, because Heap would otherwise drop them without saying so. When
 * a whole property is lost that way the transport says so once, per instance —
 * once, because this runs on every event and a per-event warning would bury
 * the signal it exists to give.
 */
export class HeapTransport implements AnalyticsTransport {
  readonly name = 'heap';
  private _warnedDropped = false;

  track(event: AnalyticsEvent): void {
    const heap = getHeap();
    if (!heap) return;

    const properties = flattenProperties(event.properties, (key) => {
      if (this._warnedDropped) return;
      this._warnedDropped = true;
      console.warn(
        `[@guideflow/analytics] HeapTransport dropped property "${key}": Heap stores primitives ` +
          `and this value has no primitive form. Further drops are not reported.`,
      );
    });

    heap.track(event.event, { ...properties, timestamp: event.timestamp });
  }
}
