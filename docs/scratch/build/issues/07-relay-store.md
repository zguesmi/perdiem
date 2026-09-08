# Implement the relay store

Status: ready-for-agent

The two endpoints, the status codes, the 16 KiB cap and the first-write-wins rule are specified in
`docs/spec.md` under "The relay interface". Implement that table and nothing beyond it.

There is no authentication. Do not add a token check, a rate limit or an allowlist. The privacy
guarantee comes from the ciphertext, not from the relay, and an unauthenticated relay is one less
thing to configure on stage. What it costs is written down in the spec.

The red tests in `relay/` drive the Hono app through its HTTP surface, not through the store, so the
store stays an implementation detail that can become Redis later without touching a test.

Not blocked: none of this depends on the Policy shape.

## Comments
