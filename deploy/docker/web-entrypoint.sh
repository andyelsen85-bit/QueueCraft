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
  valid_pair() {
    [ -s "$TLS_DIR/tls.crt" ] && [ -s "$TLS_DIR/tls.key" ] &&
      openssl x509 -in "$TLS_DIR/tls.crt" -noout >/dev/null 2>&1 &&
      openssl pkey -in "$TLS_DIR/tls.key" -noout >/dev/null 2>&1 &&
      [ "$(openssl x509 -in "$TLS_DIR/tls.crt" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256)" = \
        "$(openssl pkey -in "$TLS_DIR/tls.key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)" ]
  }
  if ! valid_pair; then
    attempts=0
    while [ "$attempts" -lt 15 ] && ! valid_pair; do
      attempts=$((attempts + 1))
      sleep 1
    done
  fi
  if ! valid_pair; then
    umask 077
    openssl req -x509 -nodes -newkey rsa:2048 \
      -days "$TLS_SELFSIGNED_DAYS" \
      -subj "/CN=$TLS_HOSTNAME" \
      -addext "subjectAltName=DNS:$TLS_HOSTNAME" \
      -keyout "$TLS_DIR/tls.key.tmp" \
      -out "$TLS_DIR/tls.crt.tmp" >/dev/null 2>&1
    if valid_pair; then
      rm -f "$TLS_DIR/tls.key.tmp" "$TLS_DIR/tls.crt.tmp"
    else
      mv -f "$TLS_DIR/tls.key.tmp" "$TLS_DIR/tls.key"
      mv -f "$TLS_DIR/tls.crt.tmp" "$TLS_DIR/tls.crt"
    fi
  fi
  cat > /etc/nginx/tls-listen.conf <<'EOF'
listen 443 ssl;
ssl_certificate /etc/nginx/certs/tls.crt;
ssl_certificate_key /etc/nginx/certs/tls.key;
ssl_protocols TLSv1.2 TLSv1.3;
EOF
  # Shared RWX volumes may not propagate inotify events between containers.
  # Reconcile even when the API wrote the certificate before Nginx started.
  /usr/local/bin/queuecraft-watch-certificates &
fi

exec "$@"