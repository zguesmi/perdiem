import { z } from "zod";

/**
 * A service's startup block: a title, then one labelled row per line, with the values in a column.
 * It is what an operator reads to check they started the process they meant to, so a row that
 * would carry a key, a price or a policy does not belong in one.
 */
export function banner(title: string, rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([label]) => label.length));

  return [title, ...rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`)].join("\n");
}

/** How far down a cause chain is worth printing. Past this the top of the chain is already clear. */
const MAX_CAUSES = 4;

/**
 * One failure, written so an operator can act on it.
 *
 * `error.message` on its own hides the two places the reason usually lives: the `cause` chain,
 * where `fetch` puts `ECONNREFUSED` and viem puts the revert, and a schema error's own list of
 * what it rejected. A cause already quoted inside its parent is dropped, because viem quotes its
 * own in full.
 */
export function describeError(error: unknown): string {
  const reasons: string[] = [];

  for (let reason: unknown = error, depth = 0; reason != null && depth <= MAX_CAUSES; depth += 1) {
    const message = messageOf(reason);
    const above = reasons.at(-1);

    if (message !== "" && (above === undefined || !above.includes(message))) {
      reasons.push(message);
    }
    reason = reason instanceof Error ? reason.cause : undefined;
  }

  return reasons.length === 0 ? "unknown failure" : reasons.join("\n  caused by: ");
}

/** One link of the chain. A child process failure carries its reason on `stderr`, not in `message`. */
function messageOf(reason: unknown): string {
  if (reason instanceof z.ZodError) {
    return z.prettifyError(reason);
  }

  if (reason instanceof Error) {
    const { stderr } = reason as { stderr?: unknown };
    return typeof stderr === "string" && stderr.trim() !== ""
      ? `${reason.message}: ${stderr.trim()}`
      : reason.message;
  }

  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}
