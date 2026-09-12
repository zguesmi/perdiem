import { test } from "node:test";
import assert from "node:assert/strict";

import { x25519 } from "@noble/curves/ed25519.js";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex, concatHex, keccak256, zeroHash } from "viem";

import {
  BID_TYPES,
  bidCommitment,
  bidDomain,
  bidHash,
  bidMessage,
  type Bid,
} from "../../shared/bid.ts";
import { hashPolicy } from "../../shared/policy-hash.ts";
import { referenceBid, VERIFYING_CONTRACT } from "../../shared/reference-bid.ts";
import { referencePolicy } from "../../shared/reference-policy.ts";
import { sealBid, type SealedBidPayload } from "../../shared/sealed-bid.ts";
import { sealPolicy } from "../../shared/sealed-policy.ts";
import { runEnclave, type EnclaveInputs } from "../src/enclave.ts";

const AUCTION_ID = `0x${"a1".repeat(32)}` as const;
const BOOKING_ID = "MzAxMTQ4NDk=";
const BOOKING_URL = "https://api.example.test/v3.0";
const BOOKING_API_KEY = "sand_00000000-0000-0000-0000-000000000000";

const enclavePrivateKey = x25519.utils.randomSecretKey();
const enclavePublicKey = x25519.getPublicKey(enclavePrivateKey);

const policyHash = hashPolicy(referencePolicy);
const sealedPolicy = sealPolicy(referencePolicy, enclavePublicKey, policyHash);

/**
 * The demo table, one wallet each: a three-star bid too dear to trade down, and two four-star bids
 * where the dearer one wins on the buyer's private preferences. One key per supplier, because
 * `commit` is once per address. Test scaffolding, and the keys hold nothing on any chain.
 */
const suppliers = [
  {
    account: privateKeyToAccount(`0x${"11".repeat(32)}`),
    salt: `0x${"11".repeat(32)}`,
    terms: { stars: 3, price: 330_000_000, refundable: true, breakfastIncluded: false },
  },
  {
    account: privateKeyToAccount(`0x${"22".repeat(32)}`),
    salt: `0x${"22".repeat(32)}`,
    terms: { stars: 4, price: 400_000_000, refundable: false, breakfastIncluded: false },
  },
  {
    account: privateKeyToAccount(`0x${"33".repeat(32)}`),
    salt: `0x${"33".repeat(32)}`,
    terms: { stars: 4, price: 440_000_000, refundable: true, breakfastIncluded: true },
  },
] as const;

type Supplier = (typeof suppliers)[number];

const [cheapest, runnerUp, winner] = suppliers;

function bidOf(supplier: Supplier, overrides: Partial<Bid> = {}): Bid {
  return {
    ...referenceBid,
    auctionId: AUCTION_ID,
    supplier: supplier.account.address,
    ...supplier.terms,
    ...overrides,
  };
}

async function payloadOf(
  supplier: Supplier,
  overrides: Partial<Bid> = {},
): Promise<SealedBidPayload> {
  const bid = bidOf(supplier, overrides);

  return {
    bid,
    salt: supplier.salt,
    signature: await supplier.account.signTypedData({
      domain: bidDomain(VERIFYING_CONTRACT),
      types: BID_TYPES,
      primaryType: "Bid",
      message: bidMessage(bid),
    }),
    bookingUrl: BOOKING_URL,
    bookingApiKey: BOOKING_API_KEY,
  };
}

const commitmentOf = (payload: SealedBidPayload): `0x${string}` =>
  bidCommitment(bidHash(payload.bid), payload.salt);

/** Hex, because that is how the supplier agent writes it and how the relay hands it back. */
const sealedBidOf = (payload: SealedBidPayload, key: Uint8Array = enclavePublicKey): string =>
  bytesToHex(sealBid(payload, key, AUCTION_ID));

/**
 * The whole pipeline over a set of payloads, each both committed on chain and posted to the relay.
 * A test that wants those two sets to disagree overrides one of them.
 */
function inputsFor(
  payloads: readonly SealedBidPayload[],
  overrides: Partial<EnclaveInputs> = {},
): EnclaveInputs {
  return {
    auctionId: AUCTION_ID,
    policyHash,
    sealedAuction: VERIFYING_CONTRACT,
    commitments: payloads.map(commitmentOf),
    committers: payloads.map((payload) => payload.bid.supplier),
    sealedPolicy,
    sealedBids: payloads.map((payload) => sealedBidOf(payload)),
    enclavePrivateKey,
    isValidSignature: () => false,
    book: () => BOOKING_ID,
    ...overrides,
  };
}

test("the second cheapest bid wins, and the settlement carries its booking", async () => {
  const payloads = await Promise.all(suppliers.map((supplier) => payloadOf(supplier)));

  const { settlement, scored, dropped } = runEnclave(inputsFor(payloads));

  assert.equal(scored, 3);
  assert.equal(dropped, 0);
  assert.deepEqual(settlement, {
    auctionId: AUCTION_ID,
    winner: winner.account.address,
    payout: 440_000_000,
    policyHash,
    bidsRoot: keccak256(concatHex(payloads.map(commitmentOf))),
    bookingId: BOOKING_ID,
  });
});

test("books with the credentials sealed inside the winning bid", async () => {
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);
  let booked: SealedBidPayload | undefined;

  runEnclave(
    inputsFor(payloads, {
      book: (payload) => {
        booked = payload;
        return BOOKING_ID;
      },
    }),
  );

  assert.equal(booked?.bid.supplier, winner.account.address);
  assert.equal(booked?.bookingUrl, BOOKING_URL);
  assert.equal(booked?.bookingApiKey, BOOKING_API_KEY);
});

test("accepts a contract account through ERC-1271", async () => {
  // A Circle agent wallet is a smart contract account: its signature recovers to the owner key,
  // while the address that stakes and wins is the wallet. Only the wallet can say the two are one.
  const wallet = "0x000000000000000000000000000000000000c1c1" as const;
  const payload = { ...(await payloadOf(winner)), bid: bidOf(winner, { supplier: wallet }) };

  const { settlement, scored } = runEnclave(
    inputsFor([payload], { isValidSignature: (supplier) => supplier === wallet }),
  );

  assert.equal(scored, 1);
  assert.equal(settlement.winner, wallet);
});

test("drops a bid whose signature belongs to nobody", async () => {
  const good = await payloadOf(winner);
  const forged = { ...(await payloadOf(runnerUp)), signature: `0x${"00".repeat(65)}` } as const;

  const { settlement, scored, dropped } = runEnclave(inputsFor([good, forged]));

  assert.equal(scored, 1);
  assert.equal(dropped, 1);
  assert.equal(settlement.winner, winner.account.address);
});

test("drops a bid whose commitment is not the one on chain", async () => {
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);

  const { settlement, scored, dropped } = runEnclave(
    inputsFor(payloads, { commitments: [commitmentOf(payloads[0]), zeroHash] }),
  );

  assert.equal(scored, 1);
  assert.equal(dropped, 1);
  assert.equal(settlement.winner, runnerUp.account.address);
});

test("drops a bid nobody can decrypt", async () => {
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);
  const strangersKey = x25519.getPublicKey(x25519.utils.randomSecretKey());

  const { scored, dropped } = runEnclave(
    inputsFor(payloads, {
      sealedBids: [sealedBidOf(payloads[0], strangersKey), sealedBidOf(payloads[1])],
    }),
  );

  assert.equal(scored, 1);
  assert.equal(dropped, 1);
});

test("a signature check that cannot complete stops the settlement", async () => {
  // Dropping the bid here would pay the runner-up, and no on-chain rule undoes that. An auction
  // that never settles is undone by `timeoutRefund`.
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);
  const wallet = "0x000000000000000000000000000000000000c1c1" as const;
  const onWallet = { ...payloads[1], bid: bidOf(winner, { supplier: wallet }) };

  assert.throws(() =>
    runEnclave(
      inputsFor([payloads[0], onWallet], {
        isValidSignature: () => {
          throw new Error("the chain read did not complete");
        },
      }),
    ),
  );
});

test("drops a relay body that is not an envelope at all", async () => {
  // The relay takes anybody's bytes under anybody's key. One blob that is not hex must not end the
  // run, or a stranger can turn every auction into a timeout refund.
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);

  const { settlement, scored, dropped } = runEnclave(
    inputsFor(payloads, { sealedBids: ["not hex at all", sealedBidOf(payloads[1])] }),
  );

  assert.equal(scored, 1);
  assert.equal(dropped, 1);
  assert.equal(settlement.winner, winner.account.address);
});

test("the bids root covers a committer whose sealed bid never arrived", async () => {
  const payloads = await Promise.all(suppliers.map((supplier) => payloadOf(supplier)));

  // Two envelopes at the relay, three commitments on chain. The root follows the chain, or the
  // contract rejects a settlement that is otherwise correct.
  const { settlement, scored } = runEnclave(
    inputsFor(payloads, { sealedBids: payloads.slice(1).map((payload) => sealedBidOf(payload)) }),
  );

  assert.equal(scored, 2);
  assert.equal(settlement.bidsRoot, keccak256(concatHex(payloads.map(commitmentOf))));
});

test("an auction nobody committed to settles on the empty root", () => {
  const { settlement } = runEnclave(inputsFor([]));

  assert.equal(settlement.bidsRoot, zeroHash);
  assert.equal(settlement.winner, null);
});

test("no eligible bid pays nobody and books nothing", async () => {
  const overpriced = await payloadOf(runnerUp, { price: 900_000_000 });

  const { settlement } = runEnclave(inputsFor([overpriced]));

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
  assert.equal(settlement.bookingId, "");
});

test("a booking that fails pays nobody rather than falling through to the next bid", async () => {
  const payloads = await Promise.all([payloadOf(runnerUp), payloadOf(winner)]);

  const { settlement } = runEnclave(inputsFor(payloads, { book: () => "" }));

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
  assert.equal(settlement.bookingId, "");
});

test("refuses a sealed policy that is not the committed one", async () => {
  const payloads = await Promise.all([payloadOf(winner)]);
  const other = { ...referencePolicy, maxPrice: 1_000_000_000 };

  assert.throws(() =>
    runEnclave(
      inputsFor(payloads, { sealedPolicy: sealPolicy(other, enclavePublicKey, policyHash) }),
    ),
  );
});

test("drops the cheapest bid the buyer's trade-down rule refuses", async () => {
  const payloads = await Promise.all([payloadOf(cheapest), payloadOf(winner)]);

  const { settlement, scored, dropped } = runEnclave(inputsFor(payloads));

  // Both bids verify: eligibility is scoring's business, not the envelope's.
  assert.equal(scored, 2);
  assert.equal(dropped, 0);
  assert.equal(settlement.winner, winner.account.address);
});
