# syntax=docker/dockerfile:1
#
# The relay. The build context is the repository root, because the workspace's lockfile and
# `shared/` both live there and no package builds without them.

FROM node:22-alpine AS dependencies
RUN corepack enable pnpm
WORKDIR /app
# Every manifest, because pnpm refuses to resolve a lockfile against a workspace it cannot see in
# full. Only this package's dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY onchain/package.json onchain/
COPY purchaser/package.json purchaser/
COPY relay/package.json relay/
COPY supplier/package.json supplier/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @perdiem/relay --filter .

FROM dependencies
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint
COPY shared/ shared/
COPY relay/ relay/
RUN pnpm --filter @perdiem/relay build
EXPOSE 8787
ENTRYPOINT ["entrypoint"]
CMD ["node", "relay/dist/index.js"]
