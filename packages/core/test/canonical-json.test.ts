import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "../src/canonical-json.ts";

// These properties hold whatever the Policy schema turns out to be, so they are safe to assert
// before docs/scratch/build/01 is resolved. They are red until canonicalJson is implemented.

test("sorts object keys", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("sorts keys at every depth", () => {
  assert.equal(canonicalJson({ outer: { b: 1, a: 2 } }), '{"outer":{"a":2,"b":1}}');
});

test("keeps array order", () => {
  assert.equal(canonicalJson({ xs: [3, 1, 2] }), '{"xs":[3,1,2]}');
});

test("emits no insignificant whitespace", () => {
  const encoded = canonicalJson({ a: 1, b: [2, 3] });
  assert.equal(encoded, '{"a":1,"b":[2,3]}');
});

test("is stable across two objects that differ only in key order", () => {
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

// RFC 8785 is only unambiguous here because every number is an integer. Anything the encoder
// cannot represent exactly, or that two encoders could represent differently, is rejected rather
// than coerced: a silently rounded field is a Policy Hash mismatch nobody can debug on chain.

test("rejects a fractional number rather than rounding it", () => {
  assert.throws(() => canonicalJson({ price: 1.5 }), /fraction/i);
});

test("names the path of the value it rejects", () => {
  assert.throws(() => canonicalJson({ outer: { xs: [0, 1.5] } }), /\/outer\/xs\/1/);
});

test("rejects a non-finite number", () => {
  assert.throws(() => canonicalJson({ a: Number.NaN }), /finite/i);
  assert.throws(() => canonicalJson({ a: Number.POSITIVE_INFINITY }), /finite/i);
  assert.throws(() => canonicalJson({ a: Number.NEGATIVE_INFINITY }), /finite/i);
});

test("rejects an integer outside the safe range", () => {
  assert.throws(() => canonicalJson({ a: Number.MAX_SAFE_INTEGER + 2 }), /safe integer/i);
});

test("accepts the ends of the safe integer range", () => {
  assert.equal(canonicalJson({ a: Number.MAX_SAFE_INTEGER }), '{"a":9007199254740991}');
  assert.equal(canonicalJson({ a: Number.MIN_SAFE_INTEGER }), '{"a":-9007199254740991}');
});

test("rejects undefined, in an object and on its own", () => {
  assert.throws(() => canonicalJson({ a: undefined }), /undefined/i);
  assert.throws(() => canonicalJson(undefined), /undefined/i);
});

// Absent and present-and-null hash differently, and an optional field has to mean one of them.
// docs/adr/0003-canonical-encoding.md picks absent.
test("rejects null", () => {
  assert.throws(() => canonicalJson({ a: null }), /null/i);
});

test("rejects a function", () => {
  assert.throws(() => canonicalJson({ a: () => 1 }), /function/i);
});

test("rejects a symbol, as a value and as a key", () => {
  assert.throws(() => canonicalJson({ a: Symbol("s") }), /symbol/i);
  assert.throws(() => canonicalJson({ [Symbol("s")]: 1, a: 1 }), /symbol/i);
});

// A bigint has no RFC 8785 number form and JSON.stringify throws on it. Integers are already
// capped at the safe range, so there is nothing a bigint could carry that a number cannot.
test("rejects a bigint", () => {
  assert.throws(() => canonicalJson({ a: 1n }), /bigint/i);
});

test("rejects an object that is not a plain object or an array", () => {
  assert.throws(() => canonicalJson({ a: new Date(0) }), /plain object/i);
  assert.throws(() => canonicalJson({ a: new Map() }), /plain object/i);
});

test("sorts keys by UTF-16 code unit, as RFC 8785 requires", () => {
  assert.equal(canonicalJson({ b: 1, A: 2, a: 3 }), '{"A":2,"a":3,"b":1}');
});

test("escapes strings the way JSON does and emits non-ASCII literally", () => {
  assert.equal(canonicalJson({ a: 'é"\n' }), '{"a":"é\\"\\n"}');
});

test("encodes booleans and strings at the top level", () => {
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson("x"), '"x"');
  assert.equal(canonicalJson(7), "7");
});

test("encodes an empty object and an empty array", () => {
  assert.equal(canonicalJson({}), "{}");
  assert.equal(canonicalJson([]), "[]");
});

test("rejects a cycle instead of overflowing the stack", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic["self"] = cyclic;

  assert.throws(() => canonicalJson(cyclic), /cycle/i);
});
