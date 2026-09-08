# Implement the relay store and its two tokens

Status: ready-for-agent

The two endpoints, the two tokens, the status codes and the first-write-wins rule are specified in
`docs/spec.md` under "The relay interface". Implement that table and nothing beyond it.

The one rule worth restating, because it is easy to get subtly wrong: a write token on the `GET` is
`403` and not `404`. A supplier must not be able to read a rival's blob and must not be able to learn
whether one exists, and `404` for an empty auction against `403` for a forbidden read leaks exactly
that.

The red tests in `relay/` drive the Hono app through its HTTP surface, not through the store, so the
store stays an implementation detail that can become Redis later without touching a test.

Not blocked: none of this depends on the Policy shape.

## Comments
