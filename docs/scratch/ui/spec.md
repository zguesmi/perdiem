# The page

One page for one auction, read top to bottom: a stepper, the panels, the balances.

## What it may show

The chain and the relay, and nothing else. The page holds no policy and no enclave private key, so
no maximum price, no preference and no bid price can reach it.

## Design rules

Every ticket in this directory is written against these. They are the whole design brief.

- The tokens in `ui/src/index.css` are the entire palette. No ticket adds a colour.
- The accent colour marks one thing: the step that is live. At most one accent element on screen.
- Type scale: 24px headings, 18px body, 15px notes. Nothing else.
- Hashes, addresses, amounts and identifiers are mono. Prose is not.
- Structure comes from whitespace and one hairline border. No shadows, no nested cards, no
  gradients, no icons beyond the step marks.
- Motion is limited to the countdown digits and rows arriving. Nothing animates longer than 150 ms.
- Every colour is defined in both schemes. The page is read in dark mode as often as light.
- An empty state is one short line. A panel never renders blank.
- Density: a field is one line. A panel that needs a scrollbar has too many fields.
