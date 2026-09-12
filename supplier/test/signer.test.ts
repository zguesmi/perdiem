import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BID_TYPES, bidDomain, bidMessage, type Bid } from "../../shared/bid.ts";
import { walletSchema } from "../src/config.ts";
import { createCircleAgentSigner, type RunCircle } from "../src/circle.ts";
import { createLocalSigner, createSigner } from "../src/signer.ts";
import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";

const RPC_URL = "http://rpc.test";
const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;
const USDC = "0x0000000000000000000000000000000000000001" as const;
const AGENT_KEY = `0x${"22".repeat(32)}` as const;
const CIRCLE_WALLET = "0x4d932db1979443e6abe8a5c57171e31ea9620484" as const;
const TX_HASH = `0x${"ab".repeat(32)}` as const;
const SIGNATURE = `0x${"cd".repeat(65)}` as const;

const bid: Bid = {
  auctionId: `0x${"a1".repeat(32)}`,
  supplier: CIRCLE_WALLET,
  hotelId: "lp1beec",
  hotelName: "Hotel Des Grands Voyageurs",
  stars: 4,
  price: 440_000_000,
  refundable: true,
  breakfastIncluded: true,
  roomType: "double",
  numberOfRooms: 1,
};

/** One mined, successful receipt for any hash. The Circle path checks it before it returns. */
function stubReceipts(t: TestContext): void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: { body?: string }) => {
    const { id } = JSON.parse(String(init?.body)) as { id: number };
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        transactionHash: TX_HASH,
        transactionIndex: "0x0",
        blockHash: `0x${"11".repeat(32)}`,
        blockNumber: "0x1",
        from: CIRCLE_WALLET,
        to: USDC,
        cumulativeGasUsed: "0x1",
        gasUsed: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        type: "0x2",
        effectiveGasPrice: "0x1",
      },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = real;
  });
}

/** Records every Circle CLI call and answers it the way the CLI does. */
function recordingCircle(): { calls: string[][]; run: RunCircle } {
  const calls: string[][] = [];
  const run: RunCircle = async (args) => {
    calls.push([...args]);
    return args[1] === "sign" ? `${SIGNATURE}\n` : JSON.stringify({ data: { txHash: TX_HASH } });
  };
  return { calls, run };
}

/** The flag a CLI call carries, so a test can read the wallet each half of the signer used. */
function flag(call: string[], name: string): string | undefined {
  const at = call.indexOf(name);
  return at === -1 ? undefined : call[at + 1];
}

test("the local signer's bid signature recovers to the address it writes from", async () => {
  const signer = createLocalSigner({ privateKey: AGENT_KEY, rpcUrl: RPC_URL });

  const signature = await signer.signBid(bid, SEALED_AUCTION);
  const recovered = await recoverTypedDataAddress({
    domain: bidDomain(SEALED_AUCTION),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(bid),
    signature,
  });

  assert.equal(recovered, signer.address);
  assert.equal(signer.address, privateKeyToAccount(AGENT_KEY).address);
});

test("the Circle signer signs and writes under one wallet address", async (t) => {
  stubReceipts(t);
  const { calls, run } = recordingCircle();
  const signer = createCircleAgentSigner({ address: CIRCLE_WALLET, rpcUrl: RPC_URL, run });

  await signer.signBid(bid, SEALED_AUCTION);
  await signer.write({
    address: SEALED_AUCTION,
    abi: sealedAuctionAbi,
    functionName: "commit",
    args: [bid.auctionId, `0x${"bb".repeat(32)}`],
  });

  assert.equal(signer.address, CIRCLE_WALLET);
  assert.deepEqual(
    calls.map((call) => flag(call, "--address")),
    [CIRCLE_WALLET, CIRCLE_WALLET],
  );
});

test("the Circle signer returns the CLI's signature and transaction hash", async (t) => {
  stubReceipts(t);
  const { calls, run } = recordingCircle();
  const signer = createCircleAgentSigner({ address: CIRCLE_WALLET, rpcUrl: RPC_URL, run });

  assert.equal(await signer.signBid(bid, SEALED_AUCTION), SIGNATURE);
  assert.equal(
    await signer.write({
      address: USDC,
      abi: usdcAbi,
      functionName: "approve",
      args: [SEALED_AUCTION, 50_000_000n],
    }),
    TX_HASH,
  );

  // The CLI takes a signature and positional arguments, not an ABI, so a wrong one here is a call
  // to a function the contract does not have.
  assert.deepEqual(calls[1]?.slice(0, 5), [
    "wallet",
    "execute",
    "approve(address,uint256)",
    SEALED_AUCTION,
    "50000000",
  ]);
});

test("the Circle signer signs the same digest a local signer does", async () => {
  const { calls, run } = recordingCircle();
  const signer = createCircleAgentSigner({ address: CIRCLE_WALLET, rpcUrl: RPC_URL, run });

  await signer.signBid(bid, SEALED_AUCTION);
  const typedData = JSON.parse(calls[0]?.[3] as string) as Record<string, unknown>;

  const recovered = await recoverTypedDataAddress({
    ...(typedData as Parameters<typeof recoverTypedDataAddress>[0]),
    signature: await createLocalSigner({ privateKey: AGENT_KEY, rpcUrl: RPC_URL }).signBid(
      bid,
      SEALED_AUCTION,
    ),
  });

  assert.equal(recovered, privateKeyToAccount(AGENT_KEY).address);
});

test("the environment picks the implementation", () => {
  const circle = createSigner(
    walletSchema.parse({ AGENT_SIGNER: "circle", CIRCLE_WALLET_ADDRESS: CIRCLE_WALLET }),
    RPC_URL,
  );
  const local = createSigner(walletSchema.parse({ AGENT_PRIVATE_KEY: AGENT_KEY }), RPC_URL);

  assert.equal(circle.address, CIRCLE_WALLET);
  assert.equal(local.address, privateKeyToAccount(AGENT_KEY).address);
});

test("a Circle wallet with no address fails at startup, not at the first bid", () => {
  assert.throws(
    () => walletSchema.parse({ AGENT_SIGNER: "circle" }),
    /AGENT_SIGNER=circle needs CIRCLE_WALLET_ADDRESS/,
  );
  assert.throws(() => walletSchema.parse({}), /AGENT_SIGNER=local needs AGENT_PRIVATE_KEY/);
});
