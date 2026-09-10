import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson } from "../src/canonical-json.ts";

// The expected bytes come from the reference implementation, not from our encoder, so this test can
// disagree with us. See test/vectors/README.md for the source and the pinned commit.

const vectors = ["french", "structures", "unicode", "weird"];

for (const name of vectors) {
  test(`reproduces the reference output for ${name}.json`, () => {
    const input = readFileSync(new URL(`./vectors/input/${name}.json`, import.meta.url), "utf8");
    const expected = readFileSync(new URL(`./vectors/output/${name}.json`, import.meta.url), "utf8");

    assert.equal(canonicalJson(JSON.parse(input)), expected);
  });
}
