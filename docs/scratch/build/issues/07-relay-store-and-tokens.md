# Implement the relay store and its two tokens

Status: ready-for-agent

One blob per auction and supplier, size-capped. Write token for suppliers, read token for the
workflow, and a supplier must not be able to read. The red tests in `relay/` state the rules.

Not blocked: none of this depends on the Policy shape.

## Comments
