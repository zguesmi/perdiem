import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { parseEventLogs } from "viem";

// The cross-language guard. `shared/` produces these three hashes in TypeScript and this file
// asserts that Solidity produces the same bytes from the same inputs. Neither side computes its
// own expected value: both read `shared/fixtures/bid-hashes.json`, regenerated with `pnpm fixtures`.
//
// A divergence here is an auction that dies silently. The enclave drops every bid whose commitment
// does not recompute, and the contract rejects a settlement whose bids root does not match.

type Fixture = {
  bid: {
    auctionId: `0x${string}`;
    supplier: `0x${string}`;
    hotelId: string;
    hotelName: string;
    stars: number;
    distanceMeters: number;
    price: number;
    refundable: boolean;
    breakfastIncluded: boolean;
    roomType: string;
    numberOfRooms: number;
  };
  salt: `0x${string}`;
  bidHash: `0x${string}`;
  commitment: `0x${string}`;
  commitments: `0x${string}`[];
  bidsRoot: `0x${string}`;
  emptyBidsRoot: `0x${string}`;
};

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../shared/fixtures/bid-hashes.json", import.meta.url)),
    "utf8",
  ),
) as Fixture;

const REQUIREMENTS = {
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  locationName: "Gare du Nord",
  latitudeMicro: 48_880_900,
  longitudeMicro: 2_355_300,
  radiusMeters: 2000,
  tradeDownStars: 3,
} as const;

/** This test never settles, so the forwarder and the enclave key only have to be present. */
const ENCLAVE_PUBLIC_KEY = `0x${"11".repeat(32)}` as const;

const PAYOUT_CAP = 750_000_000n;
const SUPPLIER_FUNDING = 500_000_000n;

describe("bid hashes agree across Solidity and TypeScript", async () => {
  const { viem } = await network.create();

  it("hashes the fixture bid to the committed struct hash", async () => {
    const hashes = await viem.deployContract("BidHashes");

    assert.equal(await hashes.read.bidHash([fixture.bid]), fixture.bidHash);
  });

  it("commits the fixture bid and salt to the committed commitment", async () => {
    const hashes = await viem.deployContract("BidHashes");

    assert.equal(await hashes.read.commitment([fixture.bidHash, fixture.salt]), fixture.commitment);
  });

  it("roots the fixture commitments in their arrival order", async () => {
    const [buyer, ...suppliers] = await viem.getWalletClients();
    const usdc = await viem.deployContract("MockUSDC");
    const auction = await viem.deployContract("SealedAuction", [
      usdc.address,
      buyer!.account.address,
      ENCLAVE_PUBLIC_KEY,
    ]);

    await usdc.write.mint([buyer!.account.address, PAYOUT_CAP]);
    await usdc.write.approve([auction.address, PAYOUT_CAP], { account: buyer!.account });

    // The identifier commits to `block.timestamp`, so it has to be read from the mined event
    // rather than from a simulated call.
    const opening = await auction.write.createAuction([fixture.bidHash, REQUIREMENTS, PAYOUT_CAP], {
      account: buyer!.account,
    });
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash: opening });
    const [created] = parseEventLogs({
      abi: auction.abi,
      eventName: "AuctionCreated",
      logs: receipt.logs,
    });
    const auctionId = created!.args.auctionId;

    assert.equal(await auction.read.bidsRoot([auctionId]), fixture.emptyBidsRoot);

    // One supplier per commitment, so the arrival order in the fixture is the arrival order the
    // contract sees.
    for (const [index, commitment] of fixture.commitments.entries()) {
      const supplier = suppliers[index]!;
      await usdc.write.mint([supplier.account.address, SUPPLIER_FUNDING]);
      await usdc.write.approve([auction.address, SUPPLIER_FUNDING], { account: supplier.account });
      await auction.write.commit([auctionId, commitment], { account: supplier.account });
    }

    assert.equal(await auction.read.bidsRoot([auctionId]), fixture.bidsRoot);
  });
});
