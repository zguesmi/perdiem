# RFC 8785 conformance vectors

Four input and output pairs, copied byte for byte from the reference implementation's test data.

- Source: `testdata/{input,output}` in <https://github.com/cyberphone/json-canonicalization>
- Pinned at commit `dc406ceaf94b5fa554fcabb92c091089c2357e83`
- Copyright 2018 Anders Rundgren, Apache License 2.0

`test/canonical-json.conformance.test.ts` asserts `canonicalJson` reproduces each output exactly.
The expected bytes come from the reference implementation, so the test can disagree with our
encoder.

## Why these four and not all six

The suite ships six pairs. `arrays.json` and `values.json` both carry `null` and fractional numbers,
which `docs/adr/0003-canonical-encoding.md` makes unrepresentable. `canonicalJson` rejects them by
design, so they are not vendored.

What each pair proves:

- `french.json` — sorting ignores locale collation.
- `structures.json` — nested key sorting, empty objects, the empty key, `56.0` written as `56`.
- `unicode.json` — no Unicode normalization; `A` plus U+030A stays two code points.
- `weird.json` — sorting by UTF-16 code unit, and only U+0000 to U+001F get a `\u` escape.

`weird.json` is the decisive one. U+1F602 is the surrogate pair D83D DE02 and U+FB33 is the single
unit FB33, so code-unit order puts the emoji first and code-point order puts it last.
