import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { banner, describeError, stars, usdcAmount } from "./log.ts";

test("prints the cause chain under the message", () => {
  const reason = new Error("connect ECONNREFUSED 127.0.0.1:8787");
  const failure = new Error("fetch failed", { cause: reason });

  assert.equal(
    describeError(failure),
    "fetch failed\n  caused by: connect ECONNREFUSED 127.0.0.1:8787",
  );
});

test("drops a cause its parent already quotes", () => {
  // viem writes its own cause into the message it throws, so printing both says it twice.
  const reason = new Error("execution reverted");
  const failure = new Error("the contract call failed: execution reverted", { cause: reason });

  assert.equal(describeError(failure), "the contract call failed: execution reverted");
});

test("stops before an endless cause chain", () => {
  let failure = new Error("bottom");
  for (let depth = 0; depth < 20; depth += 1) {
    failure = new Error(`layer ${depth}`, { cause: failure });
  }

  assert.equal(describeError(failure).split("\n").length, 5);
});

test("lists what a schema rejected, not just that it did", () => {
  const rejected = z.object({ stars: z.int().max(5) }).safeParse({ stars: 9 });

  assert.match(describeError(rejected.error), /stars/);
});

test("prints what a child process wrote to stderr", () => {
  // `execFile` puts the reason there and leaves `message` at the exit code.
  const failure = Object.assign(new Error("Command failed: circle wallet execute"), {
    stderr: "the session has expired\n",
  });

  assert.equal(
    describeError(failure),
    "Command failed: circle wallet execute: the session has expired",
  );
});

test("describes something that is not an error at all", () => {
  assert.equal(describeError("the relay refused it"), "the relay refused it");
  assert.equal(describeError({ status: 409 }), '{"status":409}');
  assert.equal(describeError(undefined), "unknown failure");
});

test("lines a banner's values up in one column", () => {
  // A test runs with no TTY, so the same call carries no escape codes here.
  assert.equal(
    banner("Agent: agent-a", [
      ["hotel", "Awesome Hotel"],
      ["wallet", "circle"],
    ]),
    "Agent: agent-a\n  hotel   Awesome Hotel\n  wallet  circle",
  );
});

test("writes USDC minor units as an amount", () => {
  assert.equal(usdcAmount(4_400_000), "4.4");
  assert.equal(usdcAmount(7_500_000n), "7.5");
  assert.equal(usdcAmount(520_000), "0.52");
  assert.equal(usdcAmount(1), "0.000001");
  assert.equal(usdcAmount(0), "0");
});

test("draws a star level as stars", () => {
  assert.equal(stars(4), "⭐⭐⭐⭐");
  assert.equal(stars(0), "");
});
