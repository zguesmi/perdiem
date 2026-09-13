/**
 * Runs the real prompt against the real model and prints what a buyer would see.
 *
 * It costs money, so it is not part of `pnpm test`. Run it after any change to
 * `prompts/intent.md` or to the Policy schema.
 *
 *   ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent
 *   ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent "two nights in Rome…"
 */
import { describeError, red } from "../../shared/log.ts";
import { createPolicyAgent, parseIntent } from "../src/policy-agent.ts";

const defaultIntent =
  "Two nights in Paris from 12 October 2026, one double room, 4 stars or better, " +
  "no more than 6 USDC for the stay. Free cancellation is worth 1 a night and " +
  "breakfast 0.5 a night. I would take 3 stars if it were 60% cheaper.";

async function main(): Promise<void> {
  const intent = process.argv.slice(2).join(" ") || defaultIntent;
  const model = process.env.INTENT_MODEL ?? "claude-opus-5";

  console.log(`model: ${model}`);
  console.log(`intent: ${intent}\n`);

  // The parsing step alone, not the whole service: funding the auction needs Privy keys, a chain
  // and the enclave's public half, and none of them say anything about the prompt.
  const answer = await parseIntent(createPolicyAgent(model), intent);
  if (answer === undefined) {
    throw new Error("the model could not produce a valid policy");
  }

  // What the buyer reads, then what they are actually committing to.
  console.log(answer.summary);
  console.log();
  console.log(JSON.stringify(answer.policy, null, 2));
}

main().catch((error: unknown) => {
  console.error(red(describeError(error)));
  process.exit(1);
});
