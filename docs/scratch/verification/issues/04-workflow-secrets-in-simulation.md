# How are workflow secrets supplied in simulation, and what is the size limit?

Status: ready-for-human
Type: research
Blocked by: 01-cre-simulate-writes-to-arc.md

The Policy and the enclave private key both have to fit. If the limit is tight, the Policy may
need trimming before it is uploaded, which changes what the enclave can score on.

## Acceptance criteria

- [ ] Row V4 is answered with the mechanism and the size limit as a number.
- [ ] The Policy and a 32-byte X25519 private key are confirmed to fit, or the trimming is
      specified.

## Comments
