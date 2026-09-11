# Improvements

What this build would get next, in order. Each item states the gap, not the plan.

## The relay is blind in both directions

The relay accepts any bytes from any address for any auction identifier. It should read
`SealedAuction` before it writes: accept a sealed bid only from an address that has committed to
that auction, and only before `bidDeadline`. It should also drop every sealed bid for an auction
once that auction reaches `Finalized` or `Timeout`. Today a stranger can fill the store, and a
finished auction's ciphertext sits there until the process restarts.

## The relay has no authentication

Any caller can list every sealed bid for an auction. No price leaks, because only the enclave holds
the private key. Bearer tokens are the obvious hardening.

## Only one signer exists

`createCircleAgentSigner` is not written. The three agents run on `createLocalSigner`, a viem
externally owned account holding a demo key. The Arc track asks for Circle Agent Stack wallets.

## The three demo prices are unverified

`agents/test/bidder.test.ts` asserts 330, 400 and 440 against the reference auction. The tests skip
without `ANTHROPIC_API_KEY`, so no run has observed those numbers.

## A price band covers one auction shape

Each agent's band covers the one or two night rate outside winter. A three night or winter auction
prices below the band and `submitBid` refuses it.

## An Anthropic outage means no bid

The model is the only pricing path. `agents/src/rate-plan.ts` was deleted with its deterministic
fallback.

## The payout cap bounds the maximum price from above

`transferFrom` is public, so anyone reads the payout cap. The demo pads it: cap 750 against a
maximum price of 520. The ceiling stays bounded, which is a workaround and not a fix.

## The requisition service holds the enclave private key

An independent party should generate the X25519 keypair, and only the public half should reach the
deployment. Whoever holds the private half reads every sealed bid and every supplier's booking
credentials.

## The relay runs on localhost

A deployed workflow cannot reach a developer's machine. A deployed demo needs the relay on a public
host.

## The auction is first price

The winner is paid its own bid. A Vickrey second price auction removes the incentive to shade a bid
and costs one more line in scoring.

## No supplier registry and no reputation

Any address can commit. A bid's star rating, refundable flag and breakfast flag are self-attested,
and no oracle contradicts them. See `docs/adr/0004-bid-attributes-are-self-attested.md`.

## The booked price is never checked

The enclave books the winner and reads back a booking identifier. It does not compare the booked
price with the bid price, and there is no cancellation path.
