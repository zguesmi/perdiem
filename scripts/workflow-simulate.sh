#!/usr/bin/env sh
# Simulates the workflow against one deployment. The argument is a network, named after the Hardhat
# network and its `.env.<network>` file: that file carries the RPC `project.yaml` reads, the contract
# address the config is written from, and the enclave private key the CLI resolves.
set -eu

network="${1:-arcTestnet}"

cd "$(dirname "$0")/../workflow-cre"

pnpm run config "$network"

# `--broadcast`, because it defaults to false: without it the settlement is written to a simulated
# chain, the auction stays in `Bidding`, and `pendingSettlement` hands back the same identifier on
# every run.
exec cre workflow simulate . \
  --broadcast \
  --non-interactive \
  --target staging-settings \
  --trigger-index 0 \
  -e "../.env.$network"
