FROM node:24-alpine
RUN corepack enable && addgroup -S queuecraft && adduser -S queuecraft -G queuecraft
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY lib/db/package.json lib/db/package.json
RUN pnpm install --frozen-lockfile
COPY --chown=queuecraft:queuecraft lib/db lib/db
USER queuecraft
CMD ["pnpm", "--filter", "@workspace/db", "run", "migrate"]