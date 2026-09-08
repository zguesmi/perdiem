# Implement canonical JSON and the policy hash in the core package

Status: ready-for-agent
Blocked by: 01

`packages/core` has the red tests already. Make them pass, and add the fixture the enclave
asserts against, so the buyer and the enclave cannot drift apart.

Both sides hashing the same Policy to different bytes means the settlement is rejected on chain and
the auction dies in `timeoutRefund`. That is the failure this ticket exists to prevent.

## Comments
