import { Runner } from "@chainlink/cre-sdk";
import { configSchema, initWorkflow } from "./workflow.ts";

// The CRE toolchain compiles this module to WASM and calls the exported `main` itself. A module
// that does not export it fails to compile with `JS module does not export main`.
export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(initWorkflow);
}
