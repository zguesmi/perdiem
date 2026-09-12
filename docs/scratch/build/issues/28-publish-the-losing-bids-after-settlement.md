# Publish the losing bids after settlement

Status: ready-for-agent Type: task Blocked by: 06, 12, 13

The page shows commitment hashes and ciphertext sizes. It cannot show a price, so the audience never
sees why the cheapest bid lost.

Nothing publishes the losing bids today. The relay holds ciphertext, the page holds no enclave
private key, and the purchaser service holds no bids. Only the enclave can open a sealed bid.

The enclave panel has the same gap. It shows state, the bids root and the claim transaction, read
from the chain. A log tail needs the CRE workflow and an endpoint the page can reach, and neither
exists.

## Acceptance criteria

- [ ] After `Finalized`, each bid shows its price, its attributes and its score.
- [ ] The source is the enclave, which is the only party that can open a sealed bid.
- [ ] The maximum price and the preferences stay unpublished.
- [ ] The enclave panel shows what the confidential handler logged during the run.

## Comments
