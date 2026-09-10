# Book through the LiteAPI sandbox and post the receipt

Status: ready-for-agent Type: task Blocked by: 05, 09,
../verification/issues/09-liteapi-booking-id-and-payment-method.md

The winning agent prebooks, books with the sandbox payment method, and posts `keccak256(bookingId)`
on chain, which releases its Stake. Silence past the deliver deadline lets anyone slash it to the
buyer.

Sandbox test guest data only. No real personal data anywhere in this repository.

## Acceptance criteria

- [ ] The winning agent learns it won from the chain, not from local scoring.
- [ ] It prebooks and books against the LiteAPI sandbox with the sandbox payment method.
- [ ] `submitReceipt` posts `keccak256(bookingId)` before `receiptDeadline` and releases the Stake.
- [ ] Silence past `receiptDeadline` lets any address slash the Stake to the buyer. One test states
      it.
- [ ] Sandbox test guest data only. No real personal data anywhere in the repository.

## Comments

## Dev review

`deliverDeadline` is `receiptDeadline`, named after the call that meets it. `submitReceipt` emits
`ReceiptPosted` and stores no receipt hash, because no on-chain rule reads it.
