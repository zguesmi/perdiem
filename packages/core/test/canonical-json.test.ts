import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson, CanonicalJsonError } from "../src/canonical-json.ts";

// The rule is RFC 8785 restricted to integers. See docs/adr/0003-canonical-encoding.md.

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

test("sorts keys by UTF-16 code unit, not by code point", () => {
  // U+1F600 is the surrogate pair D83D DE00, and U+FB00 is the single unit FB00. D83D is the
  // smaller unit, so the pair sorts first. Code-point order reverses that, and the two orders hash
  // to different bytes.
  assert.equal(canonicalJson({ "ﬀ": 1, "\u{1F600}": 2 }), '{"\u{1F600}":2,"ﬀ":1}');
});

test("rejects a fractional number rather than rounding it", () => {
  assert.throws(() => canonicalJson({ maxPrice: 520.5 }), CanonicalJsonError);
});

test("names the field that carried the fractional number", () => {
  assert.throws(() => canonicalJson({ tradeDown: { discount: 0.3 } }), {
    message: /tradeDown\.discount/,
  });
});

test("rejects an integer outside the safe range", () => {
  assert.throws(() => canonicalJson({ price: 2 ** 53 }), CanonicalJsonError);
});

test("rejects null, because an optional field is absent or present", () => {
  assert.throws(() => canonicalJson({ breakfastIncluded: null }), CanonicalJsonError);
});

test("rejects undefined rather than dropping the key", () => {
  assert.throws(() => canonicalJson({ breakfastIncluded: undefined }), CanonicalJsonError);
});

test("rejects a value no JSON type covers", () => {
  assert.throws(() => canonicalJson({ checkin: new Date(0) }), CanonicalJsonError);
  assert.throws(() => canonicalJson({ price: 1n }), CanonicalJsonError);
  assert.throws(() => canonicalJson({ score: Number.NaN }), CanonicalJsonError);
});

test("escapes control characters as lowercase four-digit hex", () => {
  assert.equal(canonicalJson({ a: "\u0001\u001f" }), '{"a":"\\u0001\\u001f"}');
});

test("escapes the five characters RFC 8785 gives a two-character form", () => {
  assert.equal(canonicalJson({ a: "\b\t\n\f\r" }), '{"a":"\\b\\t\\n\\f\\r"}');
});

test("escapes the backslash and the quote and nothing else", () => {
  assert.equal(canonicalJson({ a: '\\"é' }), '{"a":"\\\\\\"é"}');
});

test("rejects a lone surrogate", () => {
  assert.throws(() => canonicalJson({ city: "Paris\ud800" }), CanonicalJsonError);
});

test("encodes a bare value, not only an object", () => {
  assert.equal(canonicalJson(520000000), "520000000");
  assert.equal(canonicalJson("Paris"), '"Paris"');
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson([]), "[]");
});

test("folds negative zero to zero", () => {
  assert.equal(canonicalJson(-0), "0");
});

test("rejects an array hole rather than emitting bytes no parser accepts", () => {
  const sparse = [1, , 3];

  assert.throws(() => canonicalJson(sparse), CanonicalJsonError);
});

test("names the field that carried a bad key", () => {
  assert.throws(() => canonicalJson({ outer: { "bad\ud800": 1 } }), {
    message: /outer\.bad/,
  });
});

test("tells a non-finite number it is not finite, not that it needs converting", () => {
  assert.throws(() => canonicalJson({ score: Number.NaN }), { message: /not a finite number/ });
  assert.throws(() => canonicalJson({ score: Infinity }), { message: /not a finite number/ });
});
