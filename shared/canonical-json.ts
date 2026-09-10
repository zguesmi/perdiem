/**
 * The one canonical JSON encoder. The buyer and the enclave both hash a Policy with this function,
 * so their bytes agree by construction rather than by two implementations obeying one spec.
 *
 * Keys sort at every depth by UTF-16 code unit, which is what `<` compares. Every number must be a
 * safe integer: a fraction has more than one shortest decimal form, and two runtimes may pick
 * different ones. See `docs/adr/0003-canonical-encoding.md`.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (key, member: unknown) => {
    const field = key === "" ? "the value" : key;

    // `JSON.stringify` drops an undefined member instead of failing, and a dropped key is a
    // different hash nobody sees.
    if (member === undefined) {
      throw new Error(`canonicalJson cannot encode ${field}: undefined is not representable`);
    }

    if (typeof member === "number" && !Number.isSafeInteger(member)) {
      throw new Error(
        `canonicalJson cannot encode ${field}: ${member} is not a safe integer. Money is USDC ` +
          `minor units, distance is metres and coordinates are microdegrees`,
      );
    }

    // An array keeps its order. Anything else that is not a plain object has already been through
    // `toJSON` by the time the replacer sees it.
    if (member === null || typeof member !== "object" || Array.isArray(member)) {
      return member;
    }

    return Object.fromEntries(Object.entries(member).sort(([a], [b]) => (a < b ? -1 : 1)));
  });
}
