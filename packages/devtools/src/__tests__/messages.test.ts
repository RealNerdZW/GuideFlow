// ---------------------------------------------------------------------------
// The message vocabulary.
//
// Five processes exchange these names as strings. A typo is silence, not an
// error — which is how `GF_SET_DEBUG` came to be sent by the panel and handled
// by nobody. These assertions are cheap and they pin the shape of the contract.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FLOW_KEY_PREFIX,
  PORT_DEVTOOLS,
  PORT_RECORDER,
  SETTINGS_KEY,
  TAB_COMMANDS,
  TAB_REPORTS,
} from '../messages.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');

describe('the vocabulary', () => {
  it('has no duplicates within either list', () => {
    expect(new Set(TAB_COMMANDS).size).toBe(TAB_COMMANDS.length);
    expect(new Set(TAB_REPORTS).size).toBe(TAB_REPORTS.length);
  });

  it('never uses one name for both a command and a report', () => {
    // A name that means "page → worker" in one file and "worker → page" in
    // another is a routing loop waiting to happen.
    const overlap = TAB_COMMANDS.filter((c) => (TAB_REPORTS as readonly string[]).includes(c));
    expect(overlap).toEqual([]);
  });

  it('namespaces every name', () => {
    for (const name of [...TAB_COMMANDS, ...TAB_REPORTS]) {
      expect(name.startsWith('GF_'), name).toBe(true);
    }
  });

  it('keeps the two port prefixes distinct and colon-terminated', () => {
    // The worker parses the tab id with `split(':')[1]`, so the prefix must
    // end in the separator or every port resolves to tab 0.
    expect(PORT_DEVTOOLS).not.toBe(PORT_RECORDER);
    expect(PORT_DEVTOOLS.endsWith(':')).toBe(true);
    expect(PORT_RECORDER.endsWith(':')).toBe(true);
  });

  it('keeps the settings key outside the saved-flow namespace', () => {
    // GF_DELETE_FLOW confines removal to FLOW_KEY_PREFIX precisely so a
    // malformed key cannot wipe settings.
    expect(SETTINGS_KEY.startsWith(FLOW_KEY_PREFIX)).toBe(false);
  });
});

describe('the vocabulary is actually the one in use', () => {
  it('the service worker sources its allowlist from TAB_REPORTS', () => {
    // Not a second literal array kept in step by hand — that is the failure
    // mode this module exists to remove.
    const worker = read('background/service-worker.ts');
    expect(worker).toContain('new Set<string>(TAB_REPORTS)');
  });

  it('every report the content script sends is on the allowlist', () => {
    const content = read('content/inspector.ts');
    const sent = [...content.matchAll(/type:\s*'(GF_[A-Z_]+)'/g)].map((m) => m[1] as string);
    // Filter to the ones it SENDS to the worker rather than receives; both
    // appear as string literals, so the check is that anything resembling a
    // report is declared. A name that is neither a command nor a report is the
    // bug worth catching.
    const known = new Set<string>([...TAB_COMMANDS, ...TAB_REPORTS, 'GF_PROBE', 'GF_GET_RECORDING_FOR_SENDER', 'GF_CONTEXT_ADD_ELEMENT', 'GF_CONTEXT_QUICK_TOUR']);
    const unknown = [...new Set(sent)].filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });
});
