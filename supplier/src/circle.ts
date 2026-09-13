import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAbiItem, toFunctionSignature, type Abi } from "viem";
import { z } from "zod";

import { BID_TYPES, bidDomain, bidMessage, bytes32Schema } from "../../shared/bid.ts";
import { dim } from "../../shared/log.ts";
import { assertMined, createArcClient } from "./chain.ts";
import type { Signer } from "./signer.ts";

/** The Circle CLI's name for Arc testnet. It is the only Arc entry: there is no Arc mainnet. */
const CHAIN = "ARC-TESTNET";

/** The members of `bidDomain`, in the order it sets them. */
const DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

/**
 * The CLI is a workspace devDependency, so `pnpm` puts it on the path of anything it runs. An
 * agent started any other way needs it there too.
 */
const circleBinary = "circle";

/** One Circle CLI call. Injected by the tests, which have no Circle session. */
export type RunCircle = (args: readonly string[]) => Promise<string>;

/** How long to wait between two attempts. Injected by the tests, which wait out no backoff. */
export type Sleep = (milliseconds: number) => Promise<void>;

const execFileAsync = promisify(execFile);

async function runCircleCli(args: readonly string[]): Promise<string> {
  // The terms an operator accepts once with `circle terms accept` are recorded on disk, so nothing
  // here accepts them. An agent that accepted them silently would be agreeing on the operator's
  // behalf, and it would turn "the terms are not accepted" into a signing failure at the deadline.
  const { stdout } = await execFileAsync(circleBinary, [...args]);
  return stdout;
}

/**
 * What one refused call waits before the next attempt. Circle caps a developer entity at five POST
 * requests a second, and one `wallet execute` spends several of them on the challenge, its poll and
 * the transaction read. Three agents bidding on the same auction burst past that cap together, and
 * the CLI treats the refusal as fatal.
 *
 * Four attempts, because the whole bid has to land inside the bid period.
 */
const RETRY_DELAYS_MILLISECONDS = [1_000, 2_000, 4_000];

const sleepFor: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A rate limit is refused at Circle's edge, so the request never reached the API: no challenge was
 * created and nothing was broadcast. That is what makes the call safe to repeat. Any other failure
 * may have reached the chain, so it is raised as it stands.
 */
function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Service returned error 429");
}

/**
 * The CLI reports a refusal as a failed command whose output is Circle's answer, and Circle's edge
 * answers a rate limit with a Cloudflare page. Both halves of that reach a log twice, because the
 * page is in the message and on `stderr`. Only the status and the first line of detail say
 * anything, so only they survive.
 */
function readable(args: readonly string[], error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  const { stderr } = error as { stderr?: unknown };
  const output = `${error.message}\n${typeof stderr === "string" ? stderr : ""}`;
  const served = /Service returned error (\d+):([^\n<]*)/.exec(output);
  if (!served) {
    return error;
  }

  const detail = served[2]?.trim();
  const call = `circle ${args[0]} ${args[1]}`;
  return new Error(
    `${call} failed: Service returned error ${served[1]}${detail ? `: ${detail}` : ""}`,
  );
}

/** Retries a refused call, and raises everything else as it stands. */
function retrying(run: RunCircle, sleep: Sleep): RunCircle {
  return async (args) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run(args);
      } catch (error) {
        const delay = RETRY_DELAYS_MILLISECONDS[attempt];
        if (delay === undefined || !isRateLimited(error)) {
          throw readable(args, error);
        }
        // Jittered, because three agents refused in the same second would otherwise retry in the
        // same second and be refused again.
        const wait = Math.round(delay / 2 + Math.random() * delay);
        console.log(
          dim(
            `circle ${args[0]} ${args[1]}: rate limited, retry ${attempt + 1} of ${RETRY_DELAYS_MILLISECONDS.length} in ${wait} ms`,
          ),
        );
        await sleep(wait);
      }
    }
  };
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
  sleep?: Sleep;
}): Signer {
  const run = retrying(options.run ?? runCircleCli, options.sleep ?? sleepFor);
  const client = createArcClient(options.rpcUrl);

  return {
    address: options.address,

    async signBid(bid, verifyingContract) {
      const typedData = JSON.stringify({
        // `EIP712Domain` is not in `BID_TYPES`, because viem derives it from the domain itself.
        // Circle's API does not: without this member it answers
        // `Service returned error 400: Invalid typed data in request.`
        types: { EIP712Domain: DOMAIN_TYPE, ...BID_TYPES },
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
