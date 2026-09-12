import { writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Writes `workflow-cre/config.json` from one deployment's environment file. The CRE CLI reads that
 * file verbatim and expands nothing in it, and the contract address changes on every deploy, so the
 * workflow's config is generated from the same file every other service reads.
 *
 * The argument is a network, named after the Hardhat network and its `.env.<network>` file. The CRE
 * chain name is not one of these values: the local node runs with `--chain-id $ARC_CHAIN_ID`, so
 * both networks are chain 5042002 and both answer to `arc-testnet`.
 */

const ROOT = path.join(import.meta.dirname, "..");
const NETWORK = process.argv[2] ?? "arcTestnet";
const ENV_FILE = `.env.${NETWORK}`;

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
