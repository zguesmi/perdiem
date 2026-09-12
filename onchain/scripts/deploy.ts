import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { x25519 } from "@noble/curves/ed25519.js";
import { network } from "hardhat";
import { bytesToHex, isAddress } from "viem";

import arcDeployment from "../ignition/modules/Arc.ts";
import localDeployment from "../ignition/modules/Local.ts";

/**
 * Deploys `SealedAuction`, and on a local node the stand-in USDC it pulls from, so that the rest of
 * the repository has an address to call.
 *
 * ```sh
 * npx hardhat node                                        # one terminal
 * npx hardhat run scripts/deploy.ts --network localhost   # another, writing .env.localhost
 * npx hardhat run scripts/deploy.ts --network arcTestnet  # writing .env.arcTestnet
 * ```
 *
 * Arc carries a real USDC and real balances, so a deployment there is `SealedAuction` alone: no
 * token, no minting, and the addresses it would have minted to are not read.
 *
 * Run it twice and the second run deploys nothing: the enclave key is reused from the environment
 * file, and Ignition recognises the deployment it already recorded.
 */

/** The repository root, where the environment files live. `import.meta.dirname` is `onchain/scripts`. */
const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * The forwarder the Chainlink CRE simulator sends reports from, on Arc as on a local node.
 * `SealedAuction` accepts a settlement from this address alone, so a deployment that names
 * anything else can never be settled.
 */
const CRE_FORWARDER = "0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1";

/** Native balance given to each account, so it can pay gas on the local node. 10 ETH. */
const GAS_GRANT = "0x8ac7230489e80000";

const USDC_DECIMALS = 6;
const X25519_KEY_LENGTH = 32;

/** Each account the deployment funds, and the environment variable holding its address. */
const ACCOUNT_VARIABLES = {
  buyer: "BUYER_ADDRESS",
  supplier1: "SUPPLIER_1_ADDRESS",
  supplier2: "SUPPLIER_2_ADDRESS",
  supplier3: "SUPPLIER_3_ADDRESS",
} as const;

/** A positive integer from the environment file. The auction's terms are deployment parameters. */
function readAmount(variable: string): bigint {
  const value = BigInt(process.env[variable] ?? "0");

  if (value <= 0n) {
    throw new Error(`${variable} is missing from ${ENV_FILE}, or is not a positive integer`);
  }

  return value;
}

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

/** Arc has its own token and its own balances, so only a local node deploys and mints one. */
const onArc = connection.networkName === "arcTestnet";

/** Ignition's name for this deployment, and so the directory it records it in. */
const DEPLOYMENT_ID = connection.networkName;

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

const enclavePublicKey = bytesToHex(x25519.getPublicKey(enclavePrivateKey));

// The page reads the auction's whole log history from here. Arc prunes old blocks, so a page that
// starts at zero is answered with `pruned history unavailable` and renders nothing.
const fromBlock = BigInt(
  (await connection.provider.request({ method: "eth_blockNumber" })) as string,
);

// The stake and the two periods are deployment parameters, not constants: a testnet run bids in
// cents and settles in minutes, where a production one would not.
const terms = {
  supplierStake: readAmount("SUPPLIER_STAKE"),
  bidPeriod: readAmount("BID_PERIOD_SECONDS"),
  finalizePeriod: readAmount("FINALIZE_PERIOD_SECONDS"),
};

// The addresses reach every other package through the environment file. Ignition's record under
// `ignition/deployments/` stays the deployment history, and nothing outside `onchain/` reads it.
if (onArc) {
  const usdc = readAddress("USDC_ADDRESS");
  const { sealedAuction } = await connection.ignition.deploy(arcDeployment, {
    parameters: { [arcDeployment.id]: { usdc, forwarder: CRE_FORWARDER, enclavePublicKey, ...terms } },
    deploymentId: DEPLOYMENT_ID,
    displayUi: true,
  });

  await updateEnvFile({
    SEALED_AUCTION_ADDRESS: sealedAuction.address,
    VITE_FROM_BLOCK: String(fromBlock),
  });

  console.log();
  console.log(`SealedAuction  ${sealedAuction.address}`);
  console.log(`USDC           ${usdc}, already on the chain`);
  console.log(`Stake          ${terms.supplierStake}, bidding ${terms.bidPeriod}s, finalize ${terms.finalizePeriod}s`);
} else {
  const accounts = {
    buyer: readAddress(ACCOUNT_VARIABLES.buyer),
    supplier1: readAddress(ACCOUNT_VARIABLES.supplier1),
    supplier2: readAddress(ACCOUNT_VARIABLES.supplier2),
    supplier3: readAddress(ACCOUNT_VARIABLES.supplier3),
  };

  for (const address of Object.values(accounts)) {
    await connection.provider.request({ method: "hardhat_setBalance", params: [address, GAS_GRANT] });
  }

  const { usdc, sealedAuction } = await connection.ignition.deploy(localDeployment, {
    parameters: {
      [localDeployment.id]: { forwarder: CRE_FORWARDER, enclavePublicKey, ...terms, ...accounts },
    },
    deploymentId: DEPLOYMENT_ID,
    displayUi: true,
  });

  await updateEnvFile({
    SEALED_AUCTION_ADDRESS: sealedAuction.address,
    USDC_ADDRESS: usdc.address,
    USDC_DECIMALS: String(USDC_DECIMALS),
    VITE_FROM_BLOCK: String(fromBlock),
  });

  console.log();
  console.log(`SealedAuction  ${sealedAuction.address}`);
  console.log(`USDC           ${usdc.address}`);
  console.log(`Stake          ${terms.supplierStake}, bidding ${terms.bidPeriod}s, finalize ${terms.finalizePeriod}s`);
}

console.log(`Addresses written to ${ENV_FILE}.`);
