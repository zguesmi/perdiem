/**
 * The one canonical JSON encoder. Every package that hashes a Policy uses this function and no
 * other, because the buyer and the Enclave have to produce byte-identical output or the settlement
 * is rejected on chain.
 *
 * The rule is RFC 8785, the JSON Canonicalization Scheme, restricted to integers. See
 * docs/adr/0003-canonical-encoding.md. RFC 8785 pins down key order, number form, string escaping
 * and whitespace; the integer restriction removes the one part of it a hand-written implementation
 * is likely to get wrong, the shortest round-trip form of a fraction.
 *
 * Anything that cannot be encoded exactly, or that two conformant encoders could encode
 * differently, is rejected. Rounding a value here surfaces on chain as "hash mismatch" and nothing
 * else.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, "", new Set());
}

/** `path` is a JSON Pointer to `value`, so a rejection says which field is wrong. */
function encode(value: unknown, path: string, ancestors: Set<object>): string {
  switch (typeof value) {
    case "string":
      // RFC 8785 uses ECMAScript's string serialization verbatim: the short escapes, \u00XX for
      // the remaining control characters, everything else literal UTF-8.
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value, path);
    case "bigint":
      // A bigint has no RFC 8785 number form and integers are already capped at the safe range, so
      // there is nothing it could carry that a number cannot.
      throw reject(path, "is a bigint; use a number within the safe integer range");
    case "undefined":
      throw reject(path, "is undefined; an optional field is absent, never undefined");
    case "function":
      throw reject(path, "is a function, which is not JSON");
    case "symbol":
      throw reject(path, "is a symbol, which is not JSON");
    case "object":
      return encodeObject(value, path, ancestors);
    default:
      throw reject(path, `is a ${typeof value}, which is not JSON`);
  }
}

function encodeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw reject(path, `is ${String(value)}, which is not finite and has no JSON form`);
  }
  if (!Number.isInteger(value)) {
    throw reject(
      path,
      `is the fraction ${String(value)}; every number is an integer, in USDC minor units, metres or microdegrees`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw reject(path, `is outside the safe integer range and cannot round-trip: ${String(value)}`);
  }
  // Exact for every safe integer, and free of the exponent forms that only appear past 1e21.
  return String(value);
}

function encodeObject(value: object | null, path: string, ancestors: Set<object>): string {
  if (value === null) {
    // Absent and present-and-null are different bytes, so an optional field has to mean one of
    // them. docs/adr/0003-canonical-encoding.md picks absent.
    throw reject(path, "is null; an optional field is absent, never null");
  }
  if (ancestors.has(value)) {
    throw reject(path, "closes a cycle, and a cycle has no encoding");
  }

  const nested = new Set(ancestors).add(value);

  if (Array.isArray(value)) {
    // Array order is data, so it is preserved and never sorted.
    const items = value.map((item, index) => encode(item, `${path}/${String(index)}`, nested));
    return `[${items.join(",")}]`;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    // A Date, a Map or a class instance each have several plausible encodings. Guessing one of
    // them is how the two sides drift apart.
    throw reject(path, `is not a plain object: ${value.constructor?.name ?? "unknown type"}`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw reject(path, "has a symbol key, which is not JSON");
  }

  const record = value as Record<string, unknown>;
  // RFC 8785 sorts property names as arrays of UTF-16 code units, which is exactly what `<` does
  // to two JavaScript strings. Sorting by code point instead differs above the basic multilingual
  // plane.
  const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const members = keys.map(
    (key) =>
      `${JSON.stringify(key)}:${encode(record[key], `${path}/${escapePointerToken(key)}`, nested)}`,
  );
  return `{${members.join(",")}}`;
}

function reject(path: string, problem: string): Error {
  return new Error(`canonicalJson: ${path === "" ? "the value" : path} ${problem}`);
}

/** RFC 6901: `~` becomes `~0` and `/` becomes `~1`, so a pointer stays unambiguous. */
function escapePointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
