/**
 * Runs the real prompt against the real model and prints what a buyer would see.
 *
 * It costs money, so it is not part of `pnpm test`. Run it after any change to
 * `prompts/intent.md` or to the Policy schema.
 *
 *   ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent
 *   ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent "two nights in Rome…"
 */
import { createPurchaserApp } from "../src/app.ts";
import { createIntentAgent } from "../src/intent.ts";

const defaultIntent =
  "Two nights in Paris from 12 October 2026, one double room, 4 stars or better, " +
  "no more than 520 USDC for the stay. Free cancellation is worth 25 a night and " +
  "breakfast 20 a night. I would take 3 stars if it were 30% cheaper.";

async function main(): Promise<void> {
  const intent = process.argv.slice(2).join(" ") || defaultIntent;
  const model = process.env.INTENT_MODEL ?? "claude-opus-5";

  console.log(`model: ${model}`);
  console.log(`intent: ${intent}\n`);

  const app = createPurchaserApp({ intentAgent: createIntentAgent(model) });
  const response = await app.request("/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent }),
  });

  const answer = (await response.json()) as { policy?: unknown; summary?: string; error?: string };

  if (response.status !== 200) {
    throw new Error(answer.error ?? `the service answered ${response.status}`);
  }

  // What the buyer reads, then what they are actually committing to.
  console.log(answer.summary);
  console.log();
  console.log(JSON.stringify(answer.policy, null, 2));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
