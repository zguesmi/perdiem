import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "../src/canonical-json.ts";

// These properties hold whatever the Policy schema turns out to be, so they are safe to assert
// before .scratch/build/01 is resolved. They are red until canonicalJson is implemented.

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
