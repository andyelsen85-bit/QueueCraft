#!/bin/sh
set -eu

TLS_DIR=${TLS_CERT_DIR:-/etc/nginx/certs}
ACKNOWLEDGEMENT="$TLS_DIR/.tls-applied.sha256"
applied_hash=
reported_failure=

valid_pair() {
  [ -s "$TLS_DIR/tls.crt" ] && [ -s "$TLS_DIR/tls.key" ] &&
    openssl x509 -in "$TLS_DIR/tls.crt" -noout >/dev/null 2>&1 &&
    openssl pkey -in "$TLS_DIR/tls.key" -noout >/dev/null 2>&1 &&
    [ "$(openssl x509 -in "$TLS_DIR/tls.crt" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256)" = \
      "$(openssl pkey -in "$TLS_DIR/tls.key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)" ]
}

certificate_hash() {
  openssl dgst -sha256 -r "$TLS_DIR/tls.crt" | awk '{print $1}'
}

while :; do
  if valid_pair; then
    current_hash=$(certificate_hash)
    acknowledged_hash=$(cat "$ACKNOWLEDGEMENT" 2>/dev/null || true)
    if [ "$current_hash" != "$applied_hash" ] || [ "$current_hash" != "$acknowledged_hash" ]; then
      if nginx -t && nginx -s reload; then
        # A new upload may have arrived during the reload. Acknowledge only
        # the exact certificate that was validated before signaling Nginx.
        if valid_pair && [ "$(certificate_hash)" = "$current_hash" ]; then
          temporary="$ACKNOWLEDGEMENT.$$"
          printf '%s\n' "$current_hash" > "$temporary"
          # The hash is not secret. The API runs as a different UID and must
          # be able to read it even if self-signed generation set umask 077.
          chmod 0644 "$temporary"
          mv -f "$temporary" "$ACKNOWLEDGEMENT"
          applied_hash=$current_hash
          reported_failure=
          echo "Nginx reloaded the current HTTPS certificate." >&2
        fi
      elif [ "$reported_failure" != "$current_hash" ]; then
        echo "Nginx certificate validation or reload failed; retrying." >&2
        reported_failure=$current_hash
      fi
    fi
  fi
  sleep 1
done