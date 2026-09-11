import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAbiItem, toFunctionSignature, type Abi } from "viem";
import { z } from "zod";

import { BID_TYPES, bidDomain, bidMessage, bytes32Schema } from "../../shared/bid.ts";
import { assertMined, createArcClient } from "./chain.ts";
import type { Signer } from "./signer.ts";

/** The Circle CLI's name for Arc testnet. It is the only Arc entry: there is no Arc mainnet. */
const CHAIN = "ARC-TESTNET";

/**
 * The CLI is a workspace devDependency, so `pnpm` puts it on the path of anything it runs. An
 * agent started any other way needs it there too.
 */
const circleBinary = "circle";

/** One Circle CLI call. Injected by the tests, which have no Circle session. */
export type RunCircle = (args: readonly string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

async function runCircleCli(args: readonly string[]): Promise<string> {
  // The terms an operator accepts once with `circle terms accept` are recorded on disk, so nothing
  // here accepts them. An agent that accepted them silently would be agreeing on the operator's
  // behalf, and it would turn "the terms are not accepted" into a signing failure at the deadline.
  const { stdout } = await execFileAsync(circleBinary, [...args]);
  return stdout;
}

const signatureSchema = z.custom<`0x${string}`>(
  (value) => typeof value === "string" && /^0x[0-9a-f]{130}$/i.test(value),
  "expected a 65-byte signature",
);

/** Some CLI answers are wrapped in `data` and some are bare, so unwrap one level when it is there. */
const executed = z.union([
  z.object({ data: z.object({ txHash: bytes32Schema }) }).transform((answer) => answer.data),
  z.object({ txHash: bytes32Schema }),
]);

/**
 * The supplier's Circle Agent Stack wallet, driven through the Circle CLI.
 *
 * The CLI is the whole client. It authenticates as a Circle user with a session opened by an email
 * one-time code, every wallet endpoint it calls is user-scoped, and it accepts no API key, so a
 * process that holds the session signs by running the CLI. The session lasts 28 days and an
 * operator types the code once per agent.
 *
 * The wallet is an ERC-4337 smart contract account, so the signature it returns recovers to the
 * account's owner key and never to the wallet. The enclave binds the two with ERC-1271, which is
 * why the address below is the wallet: it is the address that stakes, wins and gets paid.
 */
export function createCircleAgentSigner(options: {
  address: `0x${string}`;
  rpcUrl: string;
  run?: RunCircle;
}): Signer {
  const run = options.run ?? runCircleCli;
  const client = createArcClient(options.rpcUrl);

  return {
    address: options.address,

    async signBid(bid, verifyingContract) {
      const typedData = JSON.stringify({
        types: BID_TYPES,
        primaryType: "Bid",
        domain: bidDomain(verifyingContract),
        // The one serializer, so this side and the enclave's cannot drift. `price` goes over as a
        // decimal string: EIP-712 JSON carries a uint256 as text, and `JSON.stringify` refuses a
        // bigint anyway.
        message: { ...bidMessage(bid), price: String(bid.price) },
      });

      const stdout = await run([
        "wallet",
        "sign",
        "typed-data",
        typedData,
        "--address",
        options.address,
        "--chain",
        CHAIN,
        "--quiet",
      ]);
      return signatureSchema.parse(stdout.trim());
    },

    async write(call) {
      // The CLI takes a function signature and positional arguments, not an ABI.
      const item = getAbiItem({ abi: call.abi as Abi, name: call.functionName });
      if (item?.type !== "function") {
        throw new Error(`${call.functionName} is not a function on this ABI`);
      }
      const stdout = await run([
        "wallet",
        "execute",
        toFunctionSignature(item),
        ...call.args.map((argument) => String(argument)),
        "--contract",
        call.address,
        "--address",
        options.address,
        "--chain",
        CHAIN,
        "--rpc-url",
        options.rpcUrl,
        "--output",
        "json",
      ]);
      const { txHash } = executed.parse(JSON.parse(stdout));
      return assertMined(client, txHash, call.functionName);
    },
  };
}
