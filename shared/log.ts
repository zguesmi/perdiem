import { z } from "zod";

/**
 * Colour is for a person at a terminal. A pipe, a log file and a container without a TTY get the
 * plain text, so nothing an operator greps through carries escape codes. `NO_COLOR` and
 * `FORCE_COLOR` are the two conventions every other command-line tool honours.
 */
const coloured =
  process.env.NO_COLOR === undefined &&
  (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY === true);

function paint(code: number | string, text: string): string {
  return coloured ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export const bold = (text: string): string => paint(1, text);
export const dim = (text: string): string => paint(2, text);
export const red = (text: string): string => paint(31, text);
export const green = (text: string): string => paint(32, text);
export const yellow = (text: string): string => paint(33, text);
export const cyan = (text: string): string => paint(36, text);
/** Claude's coral, from the 256-colour cube. It marks the model a service is running. */
export const coral = (text: string): string => paint("38;5;209", text);

/**
 * Stars as a reader sees them on a hotel, rather than a number they have to picture. The outlined
 * character and not the emoji: an emoji is two columns wide in some terminals and one in others,
 * which breaks the value column it sits in.
 */
export function stars(count: number): string {
  return "★".repeat(count);
}

/**
 * USDC for a person to read, without the unit: the label beside it carries that. Minor units are
 * what every other part of the system holds, and nothing converts them back except a line
 * somebody looks at.
 */
export function usdcAmount(minorUnits: bigint | number): string {
  const units = BigInt(minorUnits);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");

  return `${whole}${fraction === "" ? "" : `.${fraction}`}`;
}

/**
 * A service's startup block: a title, then one labelled row per line, with the values in a column.
 * It is what an operator reads to check they started the process they meant to, so a row that
 * would carry a key, a price or a policy does not belong in one.
 */
export function banner(title: string, rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `  ${dim(label.padEnd(width))}  ${value}`.trimEnd());

  return [bold(title), ...lines].join("\n");
}

/**
 * A group of rows nested under a bare label row of a startup block. It reads as one thing that
 * way, and the rows above it stay the service itself.
 */
export function group(label: string, rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([name]) => name.length));
  const lines = rows.map(([name, value]) => `      ${dim(name.padEnd(width))}  ${value}`.trimEnd());

  return [`  ${dim(label)}`, ...lines].join("\n");
}

/**
 * The opening clause of an agent's prompt, for the startup block: what the agent is told it is.
 * The prompt itself is too long for a row, and its first clause is the part an operator checks.
 */
export function role(prompt: string): string {
  const [opening = ""] = prompt.split(/[:.\n]/);

  return `${opening.trim()}...`;
}

/**
 * A hash as a line can carry it: the first four bytes and the last three. Enough to match one log
 * line against another, and against the head of a hash on an explorer.
 */
export function shortHex(hex: string): string {
  return hex.length <= 15 ? hex : `${hex.slice(0, 6)}...${hex.slice(-6)}`;
}

/** The label column of a step line. Long enough for the longest label any service prints. */
const STEP_WIDTH = 16;

/**
 * One step a service finished, written so the steps of a run line up under each other. The value
 * is what an operator can act on: a hash to look up, an amount, a status.
 */
export function step(label: string, value: string): string {
  return `  ${dim(label.padEnd(STEP_WIDTH))}  ${value}`;
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
