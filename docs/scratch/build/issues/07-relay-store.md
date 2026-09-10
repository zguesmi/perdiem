# Implement the relay store

Status: ready-for-agent Type: task Blocked by: none (can start immediately)

The two endpoints, the status codes, the 16 KiB cap and the first-write-wins rule are specified in
`docs/spec.md` under "The relay interface". Implement that table and nothing beyond it.

There is no authentication. Do not add a token check, a rate limit or an allowlist. The privacy
guarantee comes from the ciphertext, not from the relay, and an unauthenticated relay is one less
thing to configure during the demo. What it costs is written down in the spec.

The red tests in `relay/` drive the Hono app through its HTTP surface, not through the store, so the
store stays an implementation detail that can become Redis later without touching a test.

Not blocked: none of this depends on the Policy shape.

## Acceptance criteria

- [ ] `PUT` returns `201` on the first write for an auction and supplier pair, `409` on any later
      one, and `413` over 16 KiB.
- [ ] `GET` returns `[]` for an unknown auction, and entries ascending by supplier address.
- [ ] The body is stored as opaque bytes. Nothing parses the ciphertext and nothing knows a
      deadline.
- [ ] There is no authentication, no rate limit and no allowlist.
- [ ] The tests drive the Hono app over HTTP, so the store stays swappable without touching a test.

## Comments

## Dev review

Not reviewed yet.
