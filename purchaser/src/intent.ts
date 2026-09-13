import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { red } from "../../shared/log.ts";
import { policySchema } from "../../shared/policy.ts";

/**
 * The seam between the buyer's sentence and the model. An intent agent produces one candidate
 * answer and owns nothing else: validation and the retry belong to the service, so the tests drive
 * it with a canned answer and no network.
 *
 * The return is `unknown` on purpose. An agent typed to return a valid answer would make the
 * validation it is tested against unreachable.
 */
export type IntentAgent = (
  intent: string,
  /** Why the previous candidate was rejected. Set on the retry only. */
  rejection?: string,
) => Promise<unknown>;

/**
 * What the model answers with: the Policy, and the same thing in English for the buyer to read.
 * The summary is shown and then dropped. Only the Policy is canonicalized and hashed, so nothing
 * the model wrote in prose can change what reaches the chain.
 */
export const intentAnswer = z.object({ policy: policySchema, summary: z.string().min(1) }).strict();

export type IntentAnswer = z.infer<typeof intentAnswer>;

/** A candidate that fails validation buys exactly one more model call. Then the request fails. */
const ATTEMPTS = 2;

/**
 * One sentence in, a validated answer out, or `undefined` when the model could not write one.
 * Nothing is hashed here: the buyer has not confirmed yet.
 *
 * Each rejection is logged. It is the only record of why a 422 happened, and the prompt is the
 * thing an operator fixes with it.
 */
export async function parseIntent(
  agent: IntentAgent,
  intent: string,
): Promise<IntentAnswer | undefined> {
  // The second call is told what was wrong with the first. A byte-identical retry against a model
  // with no sampling parameters reproduces a deterministic failure and pays for it twice.
  let rejection: string | undefined;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const answer = intentAnswer.safeParse(await agent(intent, rejection));
    if (answer.success) {
      return answer.data;
    }

    rejection = z.prettifyError(answer.error);
    console.error(red(`intent: attempt ${attempt} of ${ATTEMPTS} was rejected:\n${rejection}`));
  }

  return undefined;
}

const promptPath = new URL("../prompts/intent.md", import.meta.url);

/**
 * One model call per candidate. The prompt is a file rather than a string in here because it is
 * the artefact an operator reads and edits, and because it is what a reviewer checks the Policy
 * schema against.
 */
export function createIntentAgent(model: string): IntentAgent {
  const client = new Anthropic();

  return async (intent, rejection) => {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: await readFile(promptPath, "utf8"),
      messages: [
        { role: "user", content: intent },
        ...(rejection
          ? ([
              {
                role: "user",
                content: `Your last answer was rejected:\n${rejection}\n\nAnswer again.`,
              },
            ] as const)
          : []),
      ],
    });

    // A truncated or declined answer is a failed candidate. Without this it reaches `JSON.parse`
    // and fails there, for a reason the caller cannot tell from a model that wrote prose.
    if (response.stop_reason !== "end_turn") {
      return null;
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // A model that answered with prose is a failed candidate, not a crash: the caller retries it
    // once like any other invalid answer.
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
}
