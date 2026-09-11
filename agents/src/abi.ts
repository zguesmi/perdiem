/** The slice of `SealedAuction` an agent touches: one event it listens to, the reads and the write. */
export const sealedAuctionAbi = [
  {
    type: "event",
    name: "TermsPublished",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "payoutCap", type: "uint256", indexed: false },
      {
        name: "requirements",
        type: "tuple",
        indexed: false,
        components: [
          { name: "city", type: "string" },
          { name: "checkin", type: "string" },
          { name: "checkout", type: "string" },
          { name: "minStars", type: "uint8" },
          { name: "roomType", type: "string" },
          { name: "numberOfRooms", type: "uint8" },
          { name: "tradeDownStars", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "enclavePublicKey",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "auctions",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "state", type: "uint8" },
      { name: "buyer", type: "address" },
      { name: "createdAt", type: "uint64" },
      { name: "bidDeadline", type: "uint64" },
      { name: "finalizeDeadline", type: "uint64" },
      { name: "receiptDeadline", type: "uint64" },
      { name: "policyHash", type: "bytes32" },
      { name: "payoutCap", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "payout", type: "uint256" },
      { name: "stakeReleased", type: "bool" },
      { name: "stakeSlashed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "SUPPLIER_STAKE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Only the approval an agent needs before `commit` pulls its stake. */
export const usdcAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
