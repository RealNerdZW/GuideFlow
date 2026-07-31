import { describe, it, expect, beforeEach } from 'vitest';

import { serializeDOM } from '../dom-context.js';

describe('serializeDOM privacy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('excludes a [data-gf-private] subtree', () => {
    document.body.innerHTML = `
      <button id="ok">Public</button>
      <section data-gf-private>
        <button id="secret">Account balance $12,340</button>
        <h2>jane.doe@acme.com</h2>
      </section>`;

    const out = serializeDOM(document.body);
    const json = JSON.stringify(out);
    expect(json).toContain('Public');
    expect(json).not.toContain('12,340');
    expect(json).not.toContain('jane.doe@acme.com');
  });

  it('never describes a password input', () => {
    document.body.innerHTML = `
      <input id="user" aria-label="Username" />
      <input id="pw" type="password" aria-label="Your password" />`;

    const out = serializeDOM(document.body);
    const json = JSON.stringify(out);

    // The ordinary field is described...
    expect(json).toContain('Username');
    // ...and the password field is absent entirely, not merely value-less.
    expect(json).not.toContain('Your password');
    expect(out.elements.some((e) => e.selector === '#pw')).toBe(false);
  });
});
