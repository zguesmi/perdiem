# Book through the LiteAPI sandbox and post the receipt

Status: ready-for-agent
Blocked by: 09, ../verification/issues/09-liteapi-booking-id-and-payment-method.md

The winning agent prebooks, books with the sandbox payment method, and posts
`keccak256(bookingId)` on chain, which releases its Stake. Silence past the deliver deadline lets
anyone slash it to the buyer.

Sandbox test guest data only. No real personal data anywhere in this repository.

## Comments
