import {
  cre,
  getNetwork,
  hexToBase64,
  ok,
  prepareReportRequest,
  text,
  TxStatus,
  type Runtime,
  type TeeRuntime,
} from "@chainlink/cre-sdk";
import { bytesToHex, decodeFunctionResult, encodeFunctionData, hexToBytes, zeroHash } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import { encodeClaimReport, encodeSettlementReport } from "../../shared/report.ts";
import { runEnclave } from "./enclave.ts";

export const configSchema = z.object({
  /** Cron expression with a seconds field. How often the workflow asks the chain for work. */
  schedule: z.string(),
  /** The escrow. Also the EIP-712 verifying contract, and the receiver both reports are written to. */
  sealedAuction: z.string(),
  relayUrl: z.string(),
});

export type Config = z.infer<typeof configSchema>;

/** The chain `project.yaml` names, so a run reads and writes the deployment its RPC points at. */
const CHAIN_NAME = "arc-testnet";

/** Comfortably over the 177,282 gas a claim and the 125,985 a settlement measured on Arc. */
const GAS_LIMIT = "1000000";

/** ERC-1271's answer for a signature the account owns. */
const VALID_SIGNATURE = "0x1626ba7e";

const erc1271Abi = [
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "bytes" }],
    outputs: [{ type: "bytes4" }],
  },
] as const;

/**
 * Everything this handler touches stays inside the enclave: the policy, the decrypted bids and the
 * enclave private key. Only the settlement crosses back to the DON. Nothing confidential is ever
 * logged, in simulation or otherwise.
 */
export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  const relayUrl = runtime.config.relayUrl;
  const sealedAuction = runtime.config.sealedAuction as `0x${string}`;

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: CHAIN_NAME,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`no CRE network is registered as ${CHAIN_NAME}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const httpClient = new cre.capabilities.HTTPClient();
  // Signing a report and writing it are the DON's work, and `TeeRuntime` carries neither call.
  const donRuntime = runtime.usingTheDons();

  /**
   * `callContract` is typed for `Runtime` and the cast is what lets the enclave read the chain. It
   * changes nothing at runtime: both runtimes dispatch a capability call through the same host.
   */
  const call = (to: `0x${string}`, data: `0x${string}`): `0x${string}` =>
    bytesToHex(
      evmClient
        .callContract(runtime as unknown as Runtime<Config>, {
          call: { to: hexToBase64(to), data: hexToBase64(data) },
        })
        .result().data,
    );

  const auctionId = decodeFunctionResult({
    abi: sealedAuctionAbi,
    functionName: "pendingSettlement",
    data: call(
      sealedAuction,
      encodeFunctionData({ abi: sealedAuctionAbi, functionName: "pendingSettlement" }),
    ),
  });

  if (auctionId === zeroHash) {
    return "no auction pending";
  }

  const write = (report: `0x${string}`): void => {
    const receipt = evmClient
      .writeReport(donRuntime, {
        receiver: sealedAuction,
        report: donRuntime.report(prepareReportRequest(report)).result(),
        gasConfig: { gasLimit: GAS_LIMIT },
      })
      .result();

    if (receipt.txStatus !== TxStatus.SUCCESS) {
      throw new Error(`the report was not mined: ${receipt.errorMessage || receipt.txStatus}`);
    }
  };

  // Before any bid is fetched, so a stalled run and a rejected settlement are told apart on chain.
  write(encodeClaimReport(auctionId));

  // The generated getter returns the auction record member by member, in declaration order.
  const [, , , , , policyHash] = decodeFunctionResult({
    abi: sealedAuctionAbi,
    functionName: "auctions",
    data: call(
      sealedAuction,
      encodeFunctionData({ abi: sealedAuctionAbi, functionName: "auctions", args: [auctionId] }),
    ),
  });

  const commitments = decodeFunctionResult({
    abi: sealedAuctionAbi,
    functionName: "commitments",
    data: call(
      sealedAuction,
      encodeFunctionData({ abi: sealedAuctionAbi, functionName: "commitments", args: [auctionId] }),
    ),
  });

  const committers = decodeFunctionResult({
    abi: sealedAuctionAbi,
    functionName: "committers",
    data: call(
      sealedAuction,
      encodeFunctionData({ abi: sealedAuctionAbi, functionName: "committers", args: [auctionId] }),
    ),
  });

  /** `undefined` on 404, which is the relay saying it holds nothing under that key. */
  const get = (path: string): string | undefined => {
    const response = httpClient.sendRequest(runtime, { url: `${relayUrl}${path}` }).result();

    if (response.statusCode === 404) {
      return undefined;
    }
    if (!ok(response)) {
      throw new Error(`the relay answered ${response.statusCode} for ${path}`);
    }
    return text(response);
  };

  const sealedPolicy = get(`/policies/${policyHash}`);

  if (sealedPolicy === undefined) {
    throw new Error("the relay holds no sealed policy for this auction");
  }

  // One request per committer, rather than one for the whole auction. The relay takes anybody's
  // bytes under anybody's address, so asking for the list lets a stranger grow the answer past the
  // HTTP capability's response ceiling and kill the run.
  const sealedBids = committers.flatMap((committer) => {
    const ciphertext = get(`/auctions/${auctionId}/bids/${committer}`);

    return ciphertext === undefined ? [] : [ciphertext];
  });

  const { settlement, scored, dropped } = runEnclave({
    auctionId,
    policyHash,
    sealedAuction,
    commitments,
    committers,
    sealedPolicy: hexToBytes(sealedPolicy as `0x${string}`),
    sealedBids,
    enclavePrivateKey: Buffer.from(
      runtime.getSecret({ id: "ENCLAVE_PRIVATE_KEY" }).result().value,
      "base64",
    ),
    isValidSignature: (supplier, digest, signature) => {
      // Deliberately outside the `try`: a call that does not complete must stall the auction, which
      // `timeoutRefund` undoes, rather than drop the bid and pay the runner-up, which nothing undoes.
      const answer = call(
        supplier,
        encodeFunctionData({
          abi: erc1271Abi,
          functionName: "isValidSignature",
          args: [digest, signature],
        }),
      );

      try {
        return (
          decodeFunctionResult({
            abi: erc1271Abi,
            functionName: "isValidSignature",
            data: answer,
          }) === VALID_SIGNATURE
        );
      } catch {
        // An externally owned account answers nothing at all, which is not a valid signature.
        return false;
      }
    },
    // The booking a payout pays for is not wired yet. Until it is, the enclave reports no winner,
    // which is the path a failed booking takes: the payout cap and every stake go back.
    book: () => "",
  });

  runtime.log(`bids scored=${scored} dropped=${dropped}`);
  write(encodeSettlementReport(settlement));

  return `settled ${auctionId}`;
};

/**
 * The enclave is constrained to the one registered TEE type and region. An unconstrained handler
 * would accept any enclave the DON offers.
 */
export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handlerInTee(cron.trigger({ schedule: config.schedule }), onCronTrigger, [
      { tee: "nitro", regions: ["us-west-2"] },
    ]),
  ];
}
