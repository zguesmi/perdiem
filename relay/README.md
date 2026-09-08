# @perdiem/relay

Stores one sealed bid per supplier, per auction, and serves the set to the enclave. It cannot read
what it holds: the bid, its salt and its signature are sealed to the enclave's public key inside the
supplier agent, so a relay leak reveals ciphertext and nothing else.

Two tokens, two directions:

- **Write token** — held by supplier agents. Lets an agent store its own sealed bid, nothing else.
- **Read token** — held by the workflow. Lets the enclave collect every sealed bid for an auction.

An agent that could read the relay could read a rival's price before the bid deadline. That is the
attack this split prevents. Dropping a blob is still possible, and that is what the bids root on
chain catches.

## Status

Both routes answer `501`. The tests state the token rules and are red until the store and the token
check are implemented.
