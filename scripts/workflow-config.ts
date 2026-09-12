import { writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Writes `workflow-cre/config.json` from a deployment's environment file. The CRE CLI reads that
 * file verbatim and expands nothing in it, and the contract address changes on every deploy, so the
 * workflow's config is generated from the same file every other service reads.
 */

const ROOT = path.join(import.meta.dirname, "..");
const ENV_FILE = process.argv[2] ?? ".env.arcTestnet";

process.loadEnvFile(path.join(ROOT, ENV_FILE));

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`${name} is missing from ${ENV_FILE}. Deploy the contracts first.`);
  }
  return value;
}

const config = {
  // Long enough that one run finishes before the next tick, short enough that the settlement lands
  // well inside the auction's finalize window.
  schedule: "0 */1 * * * *",
  sealedAuction: required("SEALED_AUCTION_ADDRESS"),
  relayUrl: required("RELAY_URL"),
};

const target = path.join(ROOT, "workflow-cre/config.json");

writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Wrote ${target} from ${ENV_FILE}.`);
