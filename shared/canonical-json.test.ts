import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "./canonical-json.ts";

test("sorts keys at every depth", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ b: { d: 1, c: 2 }, a: 3 }), '{"a":3,"b":{"c":2,"d":1}}');
});

test("keeps array order", () => {
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  assert.equal(canonicalJson({ a: [{ b: 1, a: 2 }] }), '{"a":[{"a":2,"b":1}]}');
});

test("rejects a number that is not a safe integer", () => {
  assert.throws(() => canonicalJson({ price: 520.5 }), /not a safe integer/);
  assert.throws(() => canonicalJson({ price: Number.NaN }), /not a safe integer/);
  assert.throws(() => canonicalJson({ price: Number.MAX_SAFE_INTEGER + 2 }), /not a safe integer/);
});

test("rejects undefined rather than dropping the key in silence", () => {
  assert.throws(() => canonicalJson({ price: undefined }), /undefined is not representable/);
  assert.throws(() => canonicalJson(undefined), /undefined is not representable/);
});

test("names the field that broke the encoding", () => {
  assert.throws(() => canonicalJson({ nested: { maxPrice: 0.5 } }), /encode maxPrice/);
});
