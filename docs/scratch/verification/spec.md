# Verification

Every assumption the build rests on that has a single right answer, checked before anything is
written against it. Answers land in `docs/decisions.md`, with the terminal output behind them in
`docs/evidence/`.

A ticket here is closed only when the answer and its evidence are both recorded. Several build
tickets are blocked on these, and the blocks are real: `createAuction` cannot be written before the
USDC decimals are known, and the sealed bid envelope cannot be written before the enclave is known
to decrypt.

Most of these need an account, a key, or a beta approval that only a human can obtain, so they are
labelled `ready-for-human`. Two are answerable from documentation and one call, and are labelled
`ready-for-agent`: 11, the Hardhat chain type, and 12, the chain id and endpoints.
