#!/bin/sh
set -eu

TLS_DIR=/etc/nginx/certs
TLS_HOSTNAME=${TLS_HOSTNAME:-queuecraft.local}
TLS_SELFSIGNED_DAYS=${TLS_SELFSIGNED_DAYS:-365}
API_UPSTREAM=${API_UPSTREAM:-127.0.0.1:8080}

sed -i "s|\${API_UPSTREAM}|$API_UPSTREAM|g" /etc/nginx/nginx.conf

if [ "${DISABLE_TLS:-false}" = "true" ]; then
  : > /etc/nginx/tls-listen.conf
else
  mkdir -p "$TLS_DIR"
  if [ ! -s "$TLS_DIR/tls.crt" ] || [ ! -s "$TLS_DIR/tls.key" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
      -days "$TLS_SELFSIGNED_DAYS" \
      -subj "/CN=$TLS_HOSTNAME" \
      -addext "subjectAltName=DNS:$TLS_HOSTNAME" \
      -keyout "$TLS_DIR/tls.key" \
      -out "$TLS_DIR/tls.crt"
  fi
  cat > /etc/nginx/tls-listen.conf <<'EOF'
listen 443 ssl;
ssl_certificate /etc/nginx/certs/tls.crt;
ssl_certificate_key /etc/nginx/certs/tls.key;
ssl_protocols TLSv1.2 TLSv1.3;
EOF
fi

exec "$@"