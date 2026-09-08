# No reveal phase

A classic sealed-bid auction splits commit from reveal, because reveals are public: reveal early and
later bidders read your price and undercut it. Neither half applies here. The Bid Commitment binds
the bid whenever it is placed, and the Sealed Bid is encrypted to the enclave's public key, so the
relay holds ciphertext and a leak during bidding reveals nothing. Nothing is published between the
bid deadline and scoring, so a supplier that waits learns nothing by waiting.

So a supplier commits on chain and posts its Sealed Bid to the relay in one beat, both before the
single bid deadline. One deadline, no agent-side timer, and no dead minute in the demo.

`commit()` still earns its place, for reasons that have nothing to do with phasing: it pulls the
Stake, it makes relay tampering detectable, and it is the on-chain set the Bids Root binds the
Settlement to. A relay-only design has none of those.

## Consequences

This depends on the enclave being able to decrypt in-enclave, which is
`docs/scratch/verification/03-enclave-decrypts-sealed-bids.md`. If that comes back negative and the
fallback is plaintext at the relay behind a bearer token, then the envelope hides nothing, a relay
leak during bidding becomes exploitable, and a reveal deadline after the bid deadline has to come
back. Reopen this decision only in that case.
