// ---------------------------------------------------------------------------
// Getting JSON back out of a model that ignored you.
//
// Regression cover for `no-json-mode-hand-parsed`. Providers now request
// structured output, but a model or an endpoint that ignores the request still
// has to be survivable — these are the shapes that used to make JSON.parse
// throw and turn a perfectly good tour into a silent [].
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';

import {
  stripCodeFences,
  extractJsonValue,
  parseModelJson,
  unwrapSteps,
  STEPS_SCHEMA,
} from '../json.js';
import { validateSteps } from '../validation.js';

describe('stripCodeFences', () => {
  it('leaves bare JSON alone', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips an uppercase language tag', () => {
    expect(stripCodeFences('```JSON\n[1,2]\n```')).toBe('[1,2]');
  });

  it('strips a bare ``` fence', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('salvages an unterminated fence, which is what truncation looks like', () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('does not eat a fence that appears inside a string value', () => {
    // A blanket replace(/```/g, '') would corrupt this. The step body is
    // legitimate content and has to survive.
    const raw = '```json\n{"body":"Use ``` for code blocks"}\n```';
    expect(JSON.parse(stripCodeFences(raw))).toEqual({ body: 'Use ``` for code blocks' });
  });
});

describe('extractJsonValue', () => {
  it('finds an object buried in prose', () => {
    expect(extractJsonValue('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it('finds an array buried in prose', () => {
    expect(extractJsonValue('Here you go: [1,2,3] — enjoy')).toBe('[1,2,3]');
  });

  it('counts nesting rather than stopping at the first close', () => {
    expect(extractJsonValue('x {"a":{"b":[1,{"c":2}]}} y')).toBe('{"a":{"b":[1,{"c":2}]}}');
  });

  it('ignores braces inside string literals', () => {
    // The reason this is a scanner and not a regex.
    const text = 'note {"body":"a } brace and a ] bracket","n":1} end';
    expect(JSON.parse(extractJsonValue(text)!)).toEqual({
      body: 'a } brace and a ] bracket',
      n: 1,
    });
  });

  it('handles escaped quotes inside strings', () => {
    const text = '{"body":"He said \\"hi\\" loudly"}';
    expect(JSON.parse(extractJsonValue(text)!)).toEqual({ body: 'He said "hi" loudly' });
  });

  it('returns null for an unbalanced value rather than a partial one', () => {
    expect(extractJsonValue('{"a":1')).toBeNull();
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJsonValue('I am afraid I cannot do that.')).toBeNull();
  });
});

describe('parseModelJson', () => {
  const identity = (v: unknown): unknown => v;

  it('parses clean JSON', () => {
    expect(parseModelJson('{"a":1}', identity, null)).toEqual({ a: 1 });
  });

  it('parses fenced JSON', () => {
    expect(parseModelJson('```json\n{"a":1}\n```', identity, null)).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in prose', () => {
    expect(parseModelJson('Here: {"a":1}. Done.', identity, null)).toEqual({ a: 1 });
  });

  it('falls back when nothing parses', () => {
    expect(parseModelJson('no json here', identity, 'FALLBACK')).toBe('FALLBACK');
  });

  it('falls back when it parses but fails validation', () => {
    // A well-formed response of the wrong shape must not reach the engine.
    const validate = (): never => {
      throw new Error('wrong shape');
    };
    expect(parseModelJson('{"a":1}', validate, 'FALLBACK')).toBe('FALLBACK');
  });

  it('reports the failure instead of failing silently', () => {
    const onFailure = vi.fn();
    parseModelJson('not json', identity, null, onFailure);

    expect(onFailure).toHaveBeenCalledTimes(1);
    const [error, raw] = onFailure.mock.calls[0] as [Error, string];
    expect(error).toBeInstanceOf(Error);
    expect(raw).toBe('not json');
  });

  it('does not report a failure on the happy path', () => {
    const onFailure = vi.fn();
    parseModelJson('{"a":1}', identity, null, onFailure);
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('unwrapSteps', () => {
  const step = { id: 'a', content: { title: 'A' } };

  it('accepts the schema shape { steps: [...] }', () => {
    expect(unwrapSteps({ steps: [step] }).map((s) => s.id)).toEqual(['a']);
  });

  it('accepts a bare array from a model that ignored the schema', () => {
    expect(unwrapSteps([step]).map((s) => s.id)).toEqual(['a']);
  });

  it('applies the same validation either way', () => {
    // The wrapper is a convenience, not a bypass: validateSteps is still the
    // authority on what reaches the engine.
    expect(unwrapSteps({ steps: [{ noId: true }] })).toEqual(validateSteps([{ noId: true }]));
  });
});

describe('STEPS_SCHEMA', () => {
  it('has an object at the root', () => {
    // OpenAI's json_schema mode rejects a root array outright, which is the
    // reason for the { steps: [...] } wrapper.
    expect(STEPS_SCHEMA.schema['type']).toBe('object');
  });
});
