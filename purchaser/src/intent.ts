import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The seam between the buyer's sentence and the model. The service owns validation and the retry;
 * a completer owns nothing but producing one candidate Policy, so the tests drive the routes with
 * a canned completion and no network.
 *
 * The return is `unknown` on purpose: a completer that could only return a valid Policy would make
 * the validation it is tested against unreachable.
 */
export type Completer = (intent: string, today: string) => Promise<unknown>;

const promptPath = new URL("../prompts/intent.md", import.meta.url);

/**
 * One model call per candidate. The prompt is a file rather than a string in here because it is
 * the artefact an operator reads and edits, and because it is what a reviewer checks the Policy
 * schema against.
 */
export function createCompleter(model: string): Completer {
  const client = new Anthropic();

  return async (intent, today) => {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: await readFile(promptPath, "utf8"),
      messages: [{ role: "user", content: `Today is ${today}.\n\n${intent}` }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // A model that answered with prose rather than JSON is a failed candidate, not a crash: the
    // caller retries it once like any other invalid answer.
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
}
