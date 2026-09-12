# syntax=docker/dockerfile:1
#
# The purchaser service. The build context is the repository root, because the workspace's lockfile
# and `shared/` both live there and no package builds without them.

FROM node:22-alpine AS dependencies
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY onchain/package.json onchain/
COPY purchaser/package.json purchaser/
COPY relay/package.json relay/
COPY supplier/package.json supplier/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @perdiem/purchaser --filter .

FROM dependencies
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint
COPY shared/ shared/
COPY purchaser/ purchaser/
EXPOSE 8788
ENTRYPOINT ["entrypoint"]
CMD ["pnpm", "--filter", "@perdiem/purchaser", "start"]
