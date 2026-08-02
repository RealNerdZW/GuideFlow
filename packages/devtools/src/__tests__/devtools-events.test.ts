// ---------------------------------------------------------------------------
// The event list, and why there are two of it.
//
// `bridge.ts` subscribes to a list of GuideFlow events and relays each to the
// panel; `panel/app.tsx` renders the same list as filter chips. Both were plain
// string arrays, hand-maintained, and both had already rotted: `tour:dismiss`
// was added to core's `TourEvents` in Phase 6 and reached neither, so a
// dismissal — the event you most want when asking why a funnel drops — was
// invisible in DevTools with nothing to indicate it was missing.
//
// The `satisfies Record<keyof TourEvents, true>` on each literal is the real
// guard, and it is a COMPILE-time one: `pnpm type-check` fails if core gains an
// event (missing property) or renames one (excess property). Nothing here can
// reproduce that — a runtime test cannot see a type.
//
// What this file adds is the assertion `satisfies` cannot make: that the two
// copies still agree with EACH OTHER. They must stay separate copies —
// `bridge.ts` is injected into the page world as a classic script, so it may
// not import a module another entry point also imports (Rollup would emit a
// shared chunk and the build's ESM guard in vite.config.ts rejects it). Two
// literals that each type-check against core can still drift from one another
// in ORDER or by one of them being edited alone; a relayed event that no chip
// filters is a usability bug, and a chip for an event never relayed is a dead
// control.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Pull the keys out of the `satisfies` literal by reading the source.
 *
 * Deliberately textual rather than importing the modules. `bridge.ts` touches
 * `window.location` and installs listeners at module scope, and `app.tsx`
 * mounts React into `#root` — importing either for one constant would drag in
 * their side effects and prove less.
 */
function eventKeysOf(relativePath: string): string[] {
  const url = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileURLToPath(url), 'utf-8');
  const block = /Object\.keys\(\{([\s\S]*?)\}\s*satisfies\s*Record<keyof TourEvents, true>\)/.exec(
    source,
  );
  if (!block?.[1]) {
    throw new Error(
      `No \`Object.keys({…} satisfies Record<keyof TourEvents, true>)\` found in ${relativePath}. ` +
        'If the construct was refactored, update this test — do not delete it: the satisfies ' +
        'clause is the only thing stopping the list from rotting again.',
    );
  }
  return [...block[1].matchAll(/'([^']+)'\s*:\s*true/g)].map((m) => m[1] as string);
}

describe('the DevTools event list', () => {
  const bridge = eventKeysOf('../bridge.ts');
  const panel = eventKeysOf('../panel/app.tsx');

  it('relays at least one event (the extractor works)', () => {
    // Guards the regex itself: a silently-empty match would make every
    // assertion below vacuously true.
    expect(bridge.length).toBeGreaterThan(10);
  });

  it('the bridge relays exactly what the panel offers as filters', () => {
    expect(bridge).toEqual(panel);
  });

  it('has no duplicate entries', () => {
    expect([...new Set(bridge)]).toEqual(bridge);
  });

  it('includes tour:dismiss — the event both lists were missing', () => {
    // Named explicitly rather than left to the equality check above, because
    // both lists could agree with each other and still both be wrong. This one
    // is the regression that motivated the change.
    expect(bridge).toContain('tour:dismiss');
  });

  it('names only events, in core’s `namespace:name` shape', () => {
    for (const name of bridge) expect(name).toMatch(/^[a-z]+:[a-z-]+$/);
  });
});
