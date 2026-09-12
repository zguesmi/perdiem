# syntax=docker/dockerfile:1
#
# One image for all three supplier agents. The agent's name is the argument, and the key it signs
# with comes from `AGENT_KEY_VARIABLE`.

FROM node:22-alpine AS dependencies
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY onchain/package.json onchain/
COPY purchaser/package.json purchaser/
COPY relay/package.json relay/
COPY supplier/package.json supplier/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @perdiem/supplier --filter .

FROM dependencies
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint
COPY shared/ shared/
COPY supplier/ supplier/
ENTRYPOINT ["entrypoint"]
CMD ["pnpm", "--filter", "@perdiem/supplier", "start"]
