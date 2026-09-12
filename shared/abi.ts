/**
 * The one description of `SealedAuction` and of the USDC token, shared by every TypeScript reader.
 *
 * The suppliers, the buyer and the page each touch a different part of the contract, and two
 * copies of one function's inputs is two chances to encode calldata the chain rejects. The
 * Solidity source is the origin of all of them, so they live together and drift together or not
 * at all.
 */
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
    type: "event",
    name: "Committed",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "supplier", type: "address", indexed: true },
      { name: "commitment", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionClaimed",
    inputs: [{ name: "auctionId", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "AuctionFinalized",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "bookingId", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionTimedOut",
    inputs: [{ name: "auctionId", type: "bytes32", indexed: true }],
  },
  {
    type: "function",
    name: "createAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyHash", type: "bytes32" },
      {
        name: "requirements",
        type: "tuple",
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
      { name: "payoutCap", type: "uint256" },
    ],
    outputs: [{ name: "auctionId", type: "bytes32" }],
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
    name: "commitments",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "committers",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "bidsRoot",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
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
      { name: "policyHash", type: "bytes32" },
      { name: "payoutCap", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "payout", type: "uint256" },
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

/** Only the approval the escrow needs before it pulls a stake or a payout cap. */
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
