FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY artifacts/queuecraft/package.json artifacts/queuecraft/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
RUN pnpm install --frozen-lockfile
COPY artifacts/queuecraft artifacts/queuecraft
COPY lib/api-client-react lib/api-client-react
ENV PORT=4173
ENV BASE_PATH=/
RUN pnpm --filter @workspace/queuecraft run build

FROM nginx:1.27-alpine AS runtime
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/artifacts/queuecraft/dist/public /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1