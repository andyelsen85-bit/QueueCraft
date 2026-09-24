FROM node:24-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
RUN pnpm install --frozen-lockfile
COPY artifacts/api-server artifacts/api-server
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
RUN pnpm --filter @workspace/api-server run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 queuecraft \
  && useradd --system --uid 10001 --gid 10001 --home-dir /app queuecraft
COPY --from=builder --chown=queuecraft:queuecraft /app/artifacts/api-server/dist ./dist
USER 10001:10001
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]