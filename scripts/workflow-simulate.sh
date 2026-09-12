#!/usr/bin/env sh
# Simulates the workflow against one deployment. The argument is a network, named after the Hardhat
# network and its `.env.<network>` file: that file carries the RPC `project.yaml` reads, the contract
# address the config is written from, and the enclave private key the CLI resolves.
set -eu

network="${1:-arcTestnet}"

cd "$(dirname "$0")/../workflow-cre"

pnpm run config "$network"

exec cre workflow simulate . \
  --non-interactive \
  --target staging-settings \
  --trigger-index 0 \
  -e "../.env.$network"
