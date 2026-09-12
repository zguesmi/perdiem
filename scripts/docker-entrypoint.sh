#!/bin/sh
#
# Loads the deployment's environment file, then hands control to the service.
#
# The file is bind-mounted from the repository root, and the onchain deployment writes the contract
# addresses into it, so it holds them only once that container has finished. Reading it here rather
# than through Compose's `env_file` is what makes the ordering work: `env_file` is read when the
# container is created, which is before anything is deployed.
set -eu

ENV_FILE=${ENV_FILE:-/app/.env.localhost}

# What the container was started with wins over what the file says. The file names the URLs a
# browser on the host uses, and inside the network the services answer under their own names.
given_arc_rpc_url=${ARC_RPC_URL-}
given_relay_url=${RELAY_URL-}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -n "$given_arc_rpc_url" ]; then
  export ARC_RPC_URL="$given_arc_rpc_url"
fi

if [ -n "$given_relay_url" ]; then
  export RELAY_URL="$given_relay_url"
fi

# One image serves the three supplier agents, and each signs as itself. The variable names the
# entry in the file this agent signs with: a private key for a local signer, a wallet address for a
# Circle one. Two agents sharing either would share an address, and `commit` is once per address,
# so the first would succeed and the rest revert.
if [ -n "${AGENT_KEY_VARIABLE-}" ]; then
  eval "export AGENT_PRIVATE_KEY=\"\${$AGENT_KEY_VARIABLE-}\""
fi

if [ -n "${AGENT_WALLET_VARIABLE-}" ]; then
  eval "export CIRCLE_WALLET_ADDRESS=\"\${$AGENT_WALLET_VARIABLE-}\""
fi

exec "$@"
