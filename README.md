# Perdiem

> Per diem (Latin for "per day") is a fixed daily allowance paid by an employer to cover
> work-related expenses, such as meals and lodging, during business travel.

Hotel AI agents bid on a sealed travel policy. The buyer's selection rules stay private and sealed
bids decide the price, so hotels fill empty rooms and buyers get the best deal.

A travel desk writes one sentence. A model turns it into a policy: hard requirements, weighted
preferences, a maximum price. The policy hash goes on chain before any bid exists. The policy itself
stays sealed to an enclave.

Three supplier agents bid blind. The enclave opens the policy, scores the bids, books the winner
against that supplier's own API, and reports the winner, the payout and the booking id. The contract
pays the winner, refunds the buyer and returns every stake.

The cheapest bid loses. It asks 2 USDC, which is 50% under the cheapest four-star bid, and the
trade-down rule wants 60%. The winner charges 6 against a 4 rival, because the private policy pays 2
for a refundable rate and 1 for breakfast. Nobody outside the enclave learns why.

The same three bids, one number changed in the policy, and the payout moves. Ask for a 40%
trade-down instead of 60% and the two-USDC three-star bid becomes eligible and wins outright. The
bids do not change; the private rule does.

## The buyer's money sits behind a spend policy

The buyer's USDC lives in a Privy organization wallet. The purchaser service holds no key for it. It
asks for a signature, and Privy answers against a spend policy, so the organization decides what the
buyer's own service may do.

- Two rules, one per transaction: `approve` on USDC and `createAuction` on `SealedAuction`. Both
  read the calldata, so the spender and the amount are checked, not just the destination address.
- The ceiling is 7.5 USDC. Ask for more and Privy refuses with `policy_violation` before anything is
  signed or mined. The service answers 422, and the buyer lowers the price.
- Above `PRIVY_QUORUM_CEILING` a 2-of-2 key quorum signs, travel manager and finance. The spend
  policy still applies to them.
- Privy signs but does not broadcast on Arc, so the service sends the signed transaction to the RPC
  itself.

## What is real, and what is not

- `SealedAuction` is live on Arc testnet at `0xd393D72732D33f38Dd1349Dfd0c35858F9fE9052`, holding
  the payout cap and every stake in Arc's own USDC.
- Each supplier agent signs with a Circle Agent Stack wallet on Arc testnet. Circle spending
  policies are mainnet only, so there is no supplier-side limit to show.
- The CRE workflow is not deployed. `cre workflow simulate --broadcast` runs the handler and writes
  the claim and the settlement to Arc testnet as real transactions.
- Simulation runs the confidential handler in the CLI's own process. The enclave is the code path a
  deployed confidential workflow runs, not attested hardware.
- The relay has no authentication. Anyone can fetch a rival's ciphertext and count the bids. Only
  the enclave can read one.
- Bookings go to the LiteAPI sandbox. No real stay is reserved.
- Stars, refundable and breakfast are self-attested by the supplier. The booking is the exception:
  the enclave books the winner's hotel and reads the booking id back, so no payout exists without a
  booking.

## The enclave key

An X25519 keypair. The public half is a `SealedAuction` constructor argument, readable as
`enclavePublicKey()`. The private half is the workflow secret `ENCLAVE_PRIVATE_KEY`, loaded only
inside `handlerInTee`.

Whoever holds it reads every sealed bid: every price, every preference, every supplier's booking
credentials. Here that is whoever runs the deployment, because `onchain/scripts/deploy.ts` generates
the pair on the first run and writes the private half into the environment file. It should be a
party that is neither the buyer nor a supplier. The enclave cannot generate its own:
`x25519.utils.randomPrivateKey()` throws `crypto.getRandomValues must be defined` there.

A new key means a new contract, and every ciphertext already at the relay stops opening.

## Where to go next

- Run it: [`docs/README.md`](docs/README.md)
- Who talks to whom: [`docs/architecture.md`](docs/architecture.md)
- The protocol: [`docs/spec.md`](docs/spec.md)

## AI tool attribution

Built with [Claude Code](https://claude.com/claude-code), model Claude Opus 5 (`claude-opus-5`),
with the `mattpocock-skills` plugin for the spec-hardening session. Idea development and research
were done on claude.ai. The full account is in [`docs/README.md`](docs/README.md).
