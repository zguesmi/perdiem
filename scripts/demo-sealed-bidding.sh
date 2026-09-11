#!/usr/bin/env bash
#
# Runs the sealed bidding half of the flow end to end, on a local node, and stops at the last
# sealed bid. It proves the privacy claim without the enclave: three commitments on chain, three
# ciphertexts at the relay, no readable bid anywhere.
#
# What it stands in for, because those parts are not built yet: the policy is `referencePolicy`
# rather than one a model wrote, the buyer is a plain viem account rather than the Privy
# organization wallet, and every supplier signs with `createLocalSigner` rather than its Circle
# wallet. Scoring, settlement and the booking are not here at all.
#
#   ./scripts/demo-sealed-bidding.sh
#
# It needs `.env` with ANTHROPIC_API_KEY, the buyer's and the three suppliers' private keys, and
# the booking credentials. Every process it starts is its own, and it stops all of them on the way
# out, so it runs twice in a row with no cleanup.
set -euo pipefail

cd "$(dirname "$0")/.."

RPC_URL=http://127.0.0.1:8545
RELAY_PORT=${RELAY_PORT:-8787}
RELAY_URL=http://localhost:${RELAY_PORT}
# Overridable, so a second terminal can `tail -f` a known path instead of hunting for it.
LOGS=${LOGS:-$(mktemp -d)}
mkdir -p "${LOGS}"
AGENTS=(hotel-astoria-agent victoria-palace-agent grands-voyageurs-agent)

step() { printf '\n== %s\n' "$1"; }

# Every service starts in its own process group and the trap kills the group. `npx` and `tsx` both
# spawn the real process as a child, so killing what `$!` names leaves a node listening on 8545,
# and that is what makes a second run need manual cleanup.
started=()
start() {
  local log=$1
  shift
  setsid "$@" >"${log}" 2>&1 &
  started+=($!)
}
cleanup() {
  local status=$?
  for pid in ${started+"${started[@]}"}; do
    kill -- -"${pid}" 2>/dev/null || true
  done
  # The agents log what they priced and why, on both paths. A failed run is usually theirs.
  for agent in "${AGENTS[@]}"; do
    if [[ -s "${LOGS}/${agent}.log" ]]; then
      sed "s/^/${agent}: /" "${LOGS}/${agent}.log"
    fi
  done
  if [[ ${status} -ne 0 ]]; then
    printf '\nFailed. The logs are in %s\n' "${LOGS}"
  fi
  exit "${status}"
}
trap cleanup EXIT

# Waits for a command to succeed, so that nothing downstream races a service that is still booting.
await() {
  local what=$1 attempts=$2
  shift 2
  for _ in $(seq "${attempts}"); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "${what} did not come up" >&2
  return 1
}

echo "service logs in ${LOGS}"

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${ANTHROPIC_API_KEY:?set it in .env; the agents price with a model}"
: "${BOOKING_URL:?set it in .env; it is sealed into every bid}"
: "${BOOKING_API_KEY:?set it in .env; it is sealed into every bid}"

# The local node, not Arc, and the local relay. These override whatever `.env` points at.
export ARC_RPC_URL=${RPC_URL}
export RELAY_URL

# A node already on 8545 would be used in place of this run's own, with whatever stale contracts
# it holds, and the deployment then fails reconciliation instead of saying why.
if curl -sf -o /dev/null -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "${RPC_URL}"; then
  echo "something already answers JSON-RPC on ${RPC_URL}. Stop it and run this again." >&2
  exit 1
fi

step "Hardhat node on ${RPC_URL}"
start "${LOGS}/node.log" bash -c "cd onchain && exec npx hardhat node --chain-id ${ARC_CHAIN_ID}"
await "the node" 60 curl -sf -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "${RPC_URL}"
echo "chain id ${ARC_CHAIN_ID}"

step "Deploy MockUSDC and SealedAuction"
(cd onchain && npx hardhat run scripts/deploy.ts --network localhost) >"${LOGS}/deploy.log" 2>&1
grep -E '^(SealedAuction|USDC) ' "${LOGS}/deploy.log"
# The deployment writes the addresses to `.env`, so they are read back rather than parsed out.
set -a
# shellcheck disable=SC1091
source .env
set +a
export ARC_RPC_URL=${RPC_URL}

step "Relay on ${RELAY_URL}"
RELAY_PORT=${RELAY_PORT} start "${LOGS}/relay.log" npx tsx relay/src/index.ts
await "the relay" 30 curl -sf "${RELAY_URL}/auctions/0x0/bids"
echo "GET /auctions/0x0/bids 200"

# The suppliers start first and bid on what they hear. They read the auction from `TermsPublished`
# and never derive an identifier, so one that starts after the auction opens never sees it.
step "Three supplier agents"
supplier=0
for agent in "${AGENTS[@]}"; do
  supplier=$((supplier + 1))
  key=SUPPLIER_${supplier}_PRIVATE_KEY
  AGENT_PRIVATE_KEY=${!key} start "${LOGS}/${agent}.log" npx tsx agents/src/index.ts "${agent}"
done
for agent in "${AGENTS[@]}"; do
  await "${agent}" 60 grep -q "listening to" "${LOGS}/${agent}.log"
  echo "${agent} log in ${LOGS}/${agent}.log"
done

step "Open the auction and wait for three sealed bids"
npx tsx scripts/sealed-bidding.ts

step "Agent output"
