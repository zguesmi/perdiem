# Turn one sentence into a Policy

Status: ready-for-agent
Blocked by: 01

One LLM call, a fixed system prompt stored at `docs/ai/intent-prompt.md`, and validation against
the Policy schema. One retry, then fail.

The service converts what the buyer says into flat numbers before they confirm: "12% more" and "20 a
night" become the actual USDC each preference is worth on this trip. The buyer confirms concrete
numbers, not a formula.

## Comments
