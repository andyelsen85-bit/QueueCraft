FROM node:24-alpine
RUN corepack disable \
  && npm install --global pnpm@10.26.1 \
  && addgroup -S -g 10001 queuecraft \
  && adduser -S -u 10001 -G queuecraft queuecraft
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY lib/db/package.json lib/db/package.json
RUN pnpm install --frozen-lockfile
COPY --chown=queuecraft:queuecraft lib/db lib/db
USER 10001:10001
CMD ["pnpm", "--filter", "@workspace/db", "run", "migrate"]