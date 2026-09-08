# Do LiteAPI prebook and book return a stable booking id, and what is the sandbox payment method called?

Status: ready-for-human Type: research

The Receipt is the keccak256 of the booking id, so the id has to be stable between the booking
response and whatever the UI displays beside the on-chain hash.

## Acceptance criteria

- [ ] Row V9 is answered with the booking id field name and the sandbox payment method string.
- [ ] One prebook and one book response are saved in `docs/evidence/`, with sandbox test guest data
      only.
- [ ] The id is confirmed stable between the booking response and any later read.

## Comments
