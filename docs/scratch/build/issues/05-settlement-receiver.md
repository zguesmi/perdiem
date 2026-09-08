# Accept the settlement from the CRE forwarder

Status: ready-for-agent
Blocked by: 04, ../verification/issues/01-cre-simulate-writes-to-arc.md

Use the Chainlink receiver template. Only the forwarder may call it, only in state Settling, and
only with a Policy Hash and a Bids Root that match what was committed.

Blocked on knowing the forwarder address.

## Comments
