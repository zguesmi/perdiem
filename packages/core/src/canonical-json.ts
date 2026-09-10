/**
 * The one canonical JSON encoder. Every package that hashes a Policy uses this and no other,
 * because the buyer and the enclave have to produce byte-identical output or the settlement is
 * rejected on chain.
 *
 * The rule is RFC 8785 restricted to integers. See `docs/adr/0003-canonical-encoding.md`.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, []);
}

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function encode(value: unknown, path: string[]): string {
  if (typeof value === "string") {
    return encodeString(value, path);
  }

  if (typeof value === "number") {
    return encodeNumber(value, path);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    const elements = value.map((element, index) => encode(element, [...path, String(index)]));

    return `[${elements.join(",")}]`;
  }

  if (isPlainObject(value)) {
    // RFC 8785 compares property names as arrays of UTF-16 code units, which is what the default
    // comparator does. Code-point order differs, and the two orders hash to different bytes.
    const members = Object.keys(value)
      .sort()
      .map((key) => `${encodeString(key, path)}:${encode(value[key], [...path, key])}`);

    return `{${members.join(",")}}`;
  }

  throw new CanonicalJsonError(describeUnsupported(value), path);
}

/** `JSON.stringify` on a lone string already escapes exactly what RFC 8785 asks for. */
function encodeString(value: string, path: string[]): string {
  // The RFC requires an error here. One encoder escaping a lone surrogate and another replacing it
  // is a silent hash divergence. Under the `u` flag a well-formed pair does not match this range.
  if (LONE_SURROGATE.test(value)) {
    throw new CanonicalJsonError("a string holds a lone surrogate", path);
  }

  return JSON.stringify(value);
}

function encodeNumber(value: number, path: string[]): string {
  // RFC 8785 formats numbers with ECMAScript `Number::toString`, which is exact for integers and
  // merely well defined for fractions. Well defined is not enough for a hand-written encoder, and
  // the enclave runtime is where a hand-written one is most likely to appear.
  if (!Number.isInteger(value)) {
    throw new CanonicalJsonError(
      `${value} is not an integer. Money is USDC minor units, distance is metres and coordinates ` +
        `are microdegrees. Convert before encoding, because nothing here rounds`,
      path,
    );
  }

  if (!Number.isSafeInteger(value)) {
    throw new CanonicalJsonError(`${value} cannot round-trip as a safe integer`, path);
  }

  // No exponent below 1e21, which is far above the safe-integer ceiling, and -0 folds to "0".
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // A Date, a Map or a class instance would go through `toJSON` or lose its fields in silence.
  const prototype = Object.getPrototypeOf(value) as object | null;

  return prototype === Object.prototype || prototype === null;
}

function describeUnsupported(value: unknown): string {
  if (value === null) {
    return "null is not representable. An optional field is absent or present, never null";
  }

  if (value === undefined) {
    return "undefined is not representable, and dropping the key would change the hash in silence";
  }

  if (typeof value === "number") {
    return `${value} is not a finite number`;
  }

  if (typeof value === "bigint") {
    return "a bigint is not representable. Every Policy number fits the safe-integer range";
  }

  return `a value of type ${typeof value} is not representable`;
}

/** Carries the field path, so a failure says which field broke the encoding. */
export class CanonicalJsonError extends Error {
  constructor(reason: string, path: string[]) {
    super(`canonicalJson cannot encode ${path.length === 0 ? "the value" : path.join(".")}: ${reason}`);
    this.name = "CanonicalJsonError";
  }
}
