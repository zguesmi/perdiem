/** The slice of `SealedAuction` an agent touches: two events it reads, one call it writes. */
export const sealedAuctionAbi = [
  {
    type: "event",
    name: "AuctionCreated",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "createdAt", type: "uint64", indexed: false },
      { name: "bidDeadline", type: "uint64", indexed: false },
      { name: "finalizeDeadline", type: "uint64", indexed: false },
      { name: "receiptDeadline", type: "uint64", indexed: false },
    ],
  },
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
