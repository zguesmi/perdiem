# Make the three supplier agents bid

Status: ready-for-agent
Blocked by: 03, 07, 22

Read a real LiteAPI rate for the auction's public requirements, apply the rate plan, sign the
bid, then commit on chain with the Stake and post the sealed bid to the relay. One beat, both before
the bid deadline.

The rate plan tests in `agents/` state the three demo prices: 330, 400, 440.

Sign through the signer interface from ticket 22, never through a viem account directly. The demo
signs with Circle Agent Stack wallets, and an agent that reaches for a private key cannot.

## Comments
