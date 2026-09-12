import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { x25519 } from "@noble/curves/ed25519.js";
import { network } from "hardhat";
import { bytesToHex, isAddress } from "viem";

import localDeployment from "../ignition/modules/Local.ts";

/**
 * Deploys the stand-in USDC and `SealedAuction` to a local node, so that the rest of the repository
 * has an address to call.
 *
 * ```sh
 * npx hardhat node                                        # one terminal
 * npx hardhat run scripts/deploy.ts --network localhost   # another, writing .env.localhost
 * ```
 *
 * Run it twice and the second run deploys nothing: the enclave key is reused from the environment
 * file, and Ignition recognises the deployment it already recorded.
 */

/** The repository root, where the environment files live. `import.meta.dirname` is `onchain/scripts`. */
const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * The forwarder the Chainlink CRE simulator sends reports from. `SealedAuction` accepts a
 * settlement from this address alone, so a local deployment that names anything else can never be
 * settled.
 */
const CRE_SIMULATOR_FORWARDER = "0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1";

/** Native balance given to each account, so it can pay gas on the local node. 10 ETH. */
const GAS_GRANT = "0x8ac7230489e80000";

/** Ignition's name for this deployment, and so the directory it records it in. */
const DEPLOYMENT_ID = "hardhat";

const USDC_DECIMALS = 6;
const X25519_KEY_LENGTH = 32;

/** Each account the deployment funds, and the environment variable holding its address. */
const ACCOUNT_VARIABLES = {
  buyer: "BUYER_ADDRESS",
  supplier1: "SUPPLIER_1_ADDRESS",
  supplier2: "SUPPLIER_2_ADDRESS",
  supplier3: "SUPPLIER_3_ADDRESS",
} as const;

function readAddress(variable: string): `0x${string}` {
  const value = process.env[variable];

  if (value === undefined || !isAddress(value)) {
    throw new Error(`${variable} is missing from ${ENV_FILE}, or is not an Ethereum address`);
  }

  return value;
}

/**
 * Rewrites the environment file in place, one assignment at a time. Replacing the file would cost
 * the operator every private key in it.
 */
async function updateEnvFile(values: Record<string, string>): Promise<void> {
  let text = await readFile(ENV_PATH, "utf8").catch(() => "");

  for (const [key, value] of Object.entries(values)) {
    const lines = text.split("\n");
    const index = lines.findIndex((line) => new RegExp(`^\\s*${key}=`).test(line));

    if (index === -1) {
      text = `${text.endsWith("\n") || text === "" ? text : `${text}\n`}${key}=${value}\n`;
    } else {
      lines[index] = `${key}=${value}`;
      text = lines.join("\n");
    }
  }

  await writeFile(ENV_PATH, text);
}

// The connection comes first, because the network it names is the environment file this run reads
// and writes. One file per network keeps a local deployment from overwriting a testnet one.
const connection = await network.create();
const ENV_FILE = `.env.${connection.networkName}`;
const ENV_PATH = path.join(ROOT, ENV_FILE);

process.loadEnvFile(ENV_PATH);

const accounts = {
  buyer: readAddress(ACCOUNT_VARIABLES.buyer),
  supplier1: readAddress(ACCOUNT_VARIABLES.supplier1),
  supplier2: readAddress(ACCOUNT_VARIABLES.supplier2),
  supplier3: readAddress(ACCOUNT_VARIABLES.supplier3),
};

// Generated on the first run only, and base64 because that is how the workflow secret carries it.
// The public half is a constructor argument, so a new key would mean a new contract, and every
// sealed bid already at the relay would stop opening.
const stored = process.env.ENCLAVE_PRIVATE_KEY;
const enclavePrivateKey =
  stored === undefined || stored === ""
    ? x25519.utils.randomSecretKey()
    : new Uint8Array(Buffer.from(stored, "base64"));

if (enclavePrivateKey.length !== X25519_KEY_LENGTH) {
  throw new Error("ENCLAVE_PRIVATE_KEY does not decode to the 32 bytes of an X25519 key");
}

if (stored === undefined || stored === "") {
  await updateEnvFile({ ENCLAVE_PRIVATE_KEY: Buffer.from(enclavePrivateKey).toString("base64") });
  console.log(`Generated an enclave keypair. The private half is in ${ENV_FILE}.`);
}

for (const address of Object.values(accounts)) {
  await connection.provider.request({ method: "hardhat_setBalance", params: [address, GAS_GRANT] });
}

// Ignition's record outlives the node. A restarted node holds no code at the addresses the record
// names, and without this `deploy` reports those addresses and deploys nothing.
const deploymentDir = path.join(import.meta.dirname, "../ignition/deployments", DEPLOYMENT_ID);
const recorded: Record<string, string> = JSON.parse(
  await readFile(path.join(deploymentDir, "deployed_addresses.json"), "utf8").catch(() => "{}"),
);
const code = await Promise.all(
  Object.values(recorded).map((address) =>
    connection.provider.request({ method: "eth_getCode", params: [address, "latest"] }),
  ),
);

if (code.length > 0 && code.every((bytecode) => bytecode === "0x")) {
  await rm(deploymentDir, { recursive: true, force: true });
}

const { usdc, sealedAuction } = await connection.ignition.deploy(localDeployment, {
  parameters: {
    [localDeployment.id]: {
      forwarder: CRE_SIMULATOR_FORWARDER,
      enclavePublicKey: bytesToHex(x25519.getPublicKey(enclavePrivateKey)),
      ...accounts,
    },
  },
  deploymentId: DEPLOYMENT_ID,
  displayUi: true,
});

// The addresses reach every other package through the environment file, the same two variables an
// Arc deployment fills in. Ignition's record under `ignition/deployments/` stays the deployment history, and
// nothing outside `onchain/` reads it.
await updateEnvFile({
  SEALED_AUCTION_ADDRESS: sealedAuction.address,
  USDC_ADDRESS: usdc.address,
  USDC_DECIMALS: String(USDC_DECIMALS),
});

console.log();
console.log(`SealedAuction  ${sealedAuction.address}`);
console.log(`USDC           ${usdc.address}`);
console.log(`Addresses written to ${ENV_FILE}.`);
