import { test } from "node:test";
import assert from "node:assert/strict";
import { concat, keccak256, pad, toBytes, toHex } from "viem";

import { bidHash } from "../src/bid-hash.ts";
import { bidDomain, bidSigningHash } from "../src/bid-signing-hash.ts";
import { ARC_TESTNET_CHAIN_ID } from "../src/chain.ts";
import { bid, chainId, expected, verifyingContract } from "./bid-fixture.ts";

const domainSeparator = keccak256(
  concat([
    keccak256(
      toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    ),
    keccak256(toBytes("Perdiem")),
    keccak256(toBytes("1")),
    pad(toHex(ARC_TESTNET_CHAIN_ID)),
    pad(verifyingContract),
  ]),
);

test("signs keccak256(0x1901, domainSeparator, bidHash)", () => {
  const expected = keccak256(concat(["0x1901", domainSeparator, bidHash(bid)]));

  assert.equal(bidSigningHash(bid, verifyingContract), expected);
});

test("reads its chain id from the one constant", () => {
  assert.deepEqual(bidDomain(verifyingContract), {
    name: "Perdiem",
    version: "1",
    chainId: ARC_TESTNET_CHAIN_ID,
    verifyingContract,
  });
});

test("binds the signature to one deployment", () => {
  const other = "0x3333333333333333333333333333333333333333";

  assert.notEqual(bidSigningHash(bid, verifyingContract), bidSigningHash(bid, other));
});

test("matches the golden fixture", () => {
  assert.equal(bidSigningHash(bid, verifyingContract), expected.signingHash);
});

// Verification 12 is open. When it answers, this is the test that says the constant moved and the
// fixture did not, instead of a hash mismatch that names nothing.
test("was generated with the chain id the code signs with", () => {
  assert.equal(chainId, ARC_TESTNET_CHAIN_ID);
});
