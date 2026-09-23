FROM node:24-bookworm-slim AS builder
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
RUN apk add --no-cache openssl
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/web-entrypoint.sh /usr/local/bin/queuecraft-web-entrypoint
COPY --from=builder /app/artifacts/queuecraft/dist/public /usr/share/nginx/html
RUN chmod +x /usr/local/bin/queuecraft-web-entrypoint
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/queuecraft-web-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]