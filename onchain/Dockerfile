# syntax=docker/dockerfile:1
#
# The node and the deployment share one image: both are Hardhat, and the deployment needs the
# artifacts the node serves. `git` is here because `forge-std` is a GitHub dependency.

FROM node:22-alpine AS dependencies
RUN apk add --no-cache git
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY onchain/package.json onchain/
COPY purchaser/package.json purchaser/
COPY relay/package.json relay/
COPY supplier/package.json supplier/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @perdiem/onchain --filter .

FROM dependencies
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint
COPY shared/ shared/
COPY onchain/ onchain/
# Compiling here puts the solc binary and the artifacts in the image, so a run downloads nothing.
RUN pnpm --filter @perdiem/onchain build
EXPOSE 8545
ENTRYPOINT ["entrypoint"]
CMD ["sh", "-c", "exec pnpm --filter @perdiem/onchain exec hardhat node --hostname 0.0.0.0 --chain-id \"${ARC_CHAIN_ID}\""]
