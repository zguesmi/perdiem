# Demo — the page and the two-minute video

The protocol is in `docs/spec.md`. This file holds only what the audience sees.

## The page

One page, five panels, top to bottom. Every panel shows a transaction hash or a log line. No design
work beyond a clean default. No mobile layout.

1. **Intent** — the sentence, the parsed Policy, then the Policy Hash, its transaction and its
   block.
2. **Funding** — Budget, ceiling, Privy approvals, the `createAuction` transaction.
3. **Bids** — commitment hashes only until settlement, then every bid with its price and attributes,
   so the audience sees why the cheapest lost.
4. **Enclave** — a live tail of the simulation log. The preferences never appear.
5. **Settlement** — winner, Payout, refund, Stake refunds, booking id, LiteAPI response.

## The video

- 0:00 The sentence.
- 0:15 The Policy, confirmed, committed. "Committed before any bid exists."
- 0:30 Privy funding with the quorum. "A human before anything irreversible."
- 0:45 Three commitments on chain, three sealed blobs at the relay. Hashes and ciphertext only.
  "Each supplier is a Circle agent wallet, and a Circle agent wallet is a smart contract account. So
  the enclave checks each bid signature with ERC-1271 against the account that staked, not with
  `ecrecover` against a key."
- 0:55 The simulation log: policy loaded in the enclave, three sealed bids decrypted and verified,
  scoring done. "The relay never saw a price."
- 1:10 The settlement. C wins at 440, refund 310. "The cheapest lost. The second cheapest won."
- 1:25 The three bids, and why: A failed the trade-down rule, B lost on cancellation and breakfast.
- 1:40 The booking id in the settlement. "The enclave booked it with the supplier's own key, so the
  payout and the proof are one transaction."
- 1:50 "Name Your Own Price had one dimension and the platform saw the bid. Here the scoring rule is
  private from the platform too."
- 2:00 End card.

## Notes

- Privy policies are realistic (exact abi, exact contract)
- privy: HR don't need to manage wallets
- Say the split out loud: control on the buyer side with Privy, autonomy on the supplier side with
  Circle. Circle spending policies are mainnet only, so there is no supplier-side limit to show on
  Arc testnet. Say it as the design, because it is: the rules that need calldata and a human are the
  buyer's.
- One line ready if a judge asks where the Circle activity is: the CLI authenticates as a Circle
  user against `agentic-wallet.circle.com`, not with a console API key, so Console API Logs stay at
  zero. `circle transaction list --address <wallet> --chain ARC-TESTNET` and the Arc explorer are
  the proof.
