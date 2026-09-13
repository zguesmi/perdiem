import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { green, red, role, step } from "../../shared/log.ts";
import { policySchema, type Policy } from "../../shared/policy.ts";

/**
 * The seam between the buyer's sentence and the model. An intent agent produces one candidate
 * answer and owns nothing else, so the tests drive it with a canned answer and no network.
 *
 * The return is `unknown` on purpose. An agent typed to return a valid answer would make the
 * validation it is tested against unreachable.
 */
export type PolicyAgent = (intent: string) => Promise<unknown>;

/**
 * What the model answers with: the Policy, and the same thing in English for the buyer to read.
 * The summary is shown and then dropped. Only the Policy is canonicalized and hashed, so nothing
 * the model wrote in prose can change what reaches the chain.
 */
export const intentAnswer = z.object({ policy: policySchema, summary: z.string().min(1) }).strict();

export type IntentAnswer = z.infer<typeof intentAnswer>;

/** The one tool the agent holds. Everything that touches a key or a chain is done in code. */
export const VALIDATE_POLICY = "validatePolicy";

/**
 * One sentence in, a validated answer out, or `undefined` when the model could not write one.
 * Nothing is hashed here: the buyer has not confirmed yet.
 *
 * The rejection is logged. It is the only record of why a 422 happened, and the prompt is the
 * thing an operator fixes with it.
 */
export async function parseIntent(
  agent: PolicyAgent,
  intent: string,
): Promise<IntentAnswer | undefined> {
  const answer = intentAnswer.safeParse(await agent(intent));
  if (answer.success) {
    return answer.data;
  }

  console.error(red(`intent: the answer was rejected:\n${z.prettifyError(answer.error)}`));
  return undefined;
}

const promptPath = new URL("../prompts/intent.md", import.meta.url);

/** The opening clause of the prompt, for the startup block: what the agent is told it is. */
export async function policyAgentRole(): Promise<string> {
  return role(await readFile(promptPath, "utf8"));
}

/**
 * A Policy as a line an operator may read. The public half only: the maximum price, the preference
 * bonuses and the trade-down discount are what the whole design keeps private.
 */
export function describePolicy(policy: Policy): string {
  const { city, checkin, checkout, numberOfRooms, roomType, minStars } = policy.hardRequirements;

  return (
    `${city}, ${checkin} to ${checkout}, ${policy.nights} nights, ` +
    `${numberOfRooms} ${roomType}, ${minStars} stars or better`
  );
}

/**
 * The agent's tool. It answers with the same schema the service validates against, so a model that
 * gets `valid` back has already written the document that reaches the chain.
 */
const validatePolicyTool: Anthropic.Tool = {
  name: VALIDATE_POLICY,
  description:
    "Checks one candidate Policy and its summary against the schema. Answers with the problems " +
    "to fix, or accepts them as the buyer's answer. A candidate this never accepted is not an " +
    "answer.",
  input_schema: {
    type: "object",
    properties: {
      policy: { type: "object", description: "The Policy, with every field the schema states." },
      summary: { type: "string", description: "The same Policy in plain English, for the buyer." },
    },
    required: ["policy", "summary"],
  },
};

/** How many candidates one sentence buys. Past this the model is not converging on the schema. */
const ROUNDS = 3;

/**
 * The intent agent: a tool-calling loop with one tool.
 *
 * The model writes a candidate, the tool tells it exactly which field the schema rejected, and it
 * fixes that field itself. The prompt is a file rather than a string in here because it is the
 * artefact an operator reads and edits, and because it is what a reviewer checks the Policy schema
 * against.
 */
export function createPolicyAgent(model: string): PolicyAgent {
  const client = new Anthropic();

  return async (intent) => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: intent }];
    const system = await readFile(promptPath, "utf8");

    for (let round = 1; round <= ROUNDS; round += 1) {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        // Adaptive thinking rules out forcing the tool, so the prompt asks for it instead. A model
        // that answers in prose is handled below rather than retried.
        thinking: { type: "adaptive" },
        system,
        tools: [validatePolicyTool],
        messages,
      });

      const call = response.content.find((block) => block.type === "tool_use");

      // Prose instead of a call is the prompt working: the sentence left a required field with no
      // value, and the model is told to say so rather than invent one.
      if (call === undefined) {
        return null;
      }

      const answer = intentAnswer.safeParse(call.input);
      if (answer.success) {
        console.log(step("Policy created", describePolicy(answer.data.policy)));
        console.log(step("Policy validated", `${green("✓")} candidate ${round} matches the schema`));
        return call.input;
      }

      const problems = z.prettifyError(answer.error);
      console.error(red(`candidate ${round} of ${ROUNDS} was rejected:\n${problems}`));

      messages.push(
        // The whole content, thinking blocks included: the API refuses a thinking turn that comes
        // back without them.
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: call.id, content: problems, is_error: true },
          ],
        },
      );
    }

    return null;
  };
}
