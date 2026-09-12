# syntax=docker/dockerfile:1
#
# The demo page, served by the Vite development server. Vite inlines every `VITE_` variable it can
# read at startup, and the contract addresses exist only after the deployment has run, so the page
# is served rather than built into the image.

FROM node:22-alpine AS dependencies
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY onchain/package.json onchain/
COPY purchaser/package.json purchaser/
COPY relay/package.json relay/
COPY supplier/package.json supplier/
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @perdiem/ui --filter .

FROM dependencies
COPY scripts/docker-entrypoint.sh /usr/local/bin/entrypoint
COPY shared/ shared/
COPY ui/ ui/
EXPOSE 5173
ENTRYPOINT ["entrypoint"]
CMD ["pnpm", "--filter", "@perdiem/ui", "dev", "--host", "0.0.0.0"]
