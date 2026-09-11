# A Bid's attributes are self-attested

A Bid carries `stars`, `refundable` and `breakfastIncluded`. The Enclave checks the EIP-712
signature and the on-chain commitment, so it knows which staked address said this and that the words
have not changed since before the deadline. It does not know whether the words are true.

Verifying them would mean the Enclave calling a hotel content API for every bid and treating that
answer as authoritative. That is a second confidential HTTP dependency, a second failure mode in the
demo path, and a new trust assumption. The content API becomes able to decide auctions. It also
would not close the hole: refundability and breakfast are properties of a rate, not of a hotel, and
rate content is exactly what a supplier is in the best position to misreport.

So the attributes are accepted as claims, and the claim is priced rather than checked. One of them
is not a claim: the Enclave books the winner against the supplier's own API and reports the booking
id, so `hotelId` has to name a hotel that supplier can actually sell before any USDC moves. See
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.

## Consequences

The product claim has to be stated at its real width, in the README and in `docs/spec.md`: the
buyer's selection rule stayed private, the bids were sealed and single-shot, and the payout went to
the supplier that claimed the best fit. Not "the best hotel wins".

Nothing enforces the three attributes. The booking proves a booking happened, not that it was
four-star, refundable or served with breakfast. The Stake is an anti-spam bond now, not a penalty:
every Stake comes back at settlement, because there is no later obligation left to fail.

A later version could compare the booking response with the Bid and refuse to settle on a mismatch.
The Enclave already holds both, so the check costs no new dependency. It is out of scope here.
