FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
RUN pnpm install --frozen-lockfile
COPY artifacts/api-server artifacts/api-server
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
RUN pnpm --filter @workspace/api-server run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S queuecraft && adduser -S queuecraft -G queuecraft
COPY --from=builder --chown=queuecraft:queuecraft /app/artifacts/api-server/dist ./dist
USER queuecraft
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]