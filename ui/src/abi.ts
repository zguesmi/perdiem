/**
 * The slice of `SealedAuction` the page reads. Views and events only: the page never writes.
 *
 * `auctions` and `commitments` are the two reads the panels are built from, so the page holds no
 * auction state of its own and a reload shows the same thing the chain does. The events are read
 * for one reason the views cannot serve: a transaction hash to link each step to.
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
    name: "commitments",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "bidsRoot",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;
