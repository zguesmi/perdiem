# A Bid's attributes are self-attested

A Bid carries `stars`, `distanceMeters`, `refundable` and `breakfastIncluded`. The Enclave checks
the EIP-712 signature and the on-chain commitment, so it knows which staked address said this and
that the words have not changed since before the deadline. It does not know whether the words are
true.

Verifying them would mean the Enclave calling a hotel content API for every bid and treating that
answer as authoritative. That is a second confidential HTTP dependency, a second failure mode in the
demo path, and a new trust assumption. The content API becomes able to decide auctions. It also
would not close the hole: refundability and breakfast are properties of a rate, not of a hotel, and
rate content is exactly what a supplier is in the best position to misreport.

So the attributes are accepted as claims, and the claim is priced rather than checked. What backs it
is the Stake: the winner has to produce a booking Receipt before `deliverDeadline` or anyone can
slash 50 USDC to the buyer.

## Consequences

The product claim has to be stated at its real width, in the README and in `docs/spec.md`: the
buyer's selection rule stayed private, the bids were sealed and single-shot, and the payout went to
the supplier that claimed the best fit. Not "the best hotel wins".

The Stake is the only enforcement, so its size is a product decision rather than an anti-spam
constant. At 50 USDC against a 440 payout it deters an idle lie and not a determined one, which is
acceptable for a demo and would not be for a deployment.

A later version could escrow against the Receipt's content rather than its existence. Parse the
LiteAPI booking response and slash on a mismatch between what was booked and what was bid. That is
the natural next step and it is out of scope here.
