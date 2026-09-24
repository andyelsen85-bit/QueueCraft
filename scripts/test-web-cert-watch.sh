#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
temporary=$(mktemp -d)
watcher=
cleanup() {
  if [ -n "$watcher" ]; then
    kill "$watcher" 2>/dev/null || true
    wait "$watcher" 2>/dev/null || true
  fi
  rm -rf "$temporary"
}
trap cleanup EXIT HUP INT TERM
mkdir -p "$temporary/certs" "$temporary/bin"

cat > "$temporary/bin/nginx" <<'EOF'
#!/bin/sh
case "$1 $2" in
  "-t ") exit 0 ;;
  "-s reload")
    if [ -f "$MOCK_NGINX_FAIL_ONCE" ]; then
      rm "$MOCK_NGINX_FAIL_ONCE"
      exit 1
    fi
    printf 'reload\n' >> "$MOCK_NGINX_LOG"
    exit 0
    ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temporary/bin/nginx"

for name in first second; do
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -subj "/CN=$name.example.invalid" \
    -keyout "$temporary/$name.key" -out "$temporary/$name.crt" >/dev/null 2>&1
done
cp "$temporary/first.key" "$temporary/certs/tls.key"
cp "$temporary/first.crt" "$temporary/certs/tls.crt"

# Exercise the restrictive umask inherited after self-signed generation.
umask 077
export TLS_CERT_DIR="$temporary/certs"
export MOCK_NGINX_LOG="$temporary/nginx.log"
export MOCK_NGINX_FAIL_ONCE="$temporary/fail-once"
PATH="$temporary/bin:$PATH" sh "$root/deploy/docker/watch-certificates.sh" >"$temporary/watch.log" 2>&1 &
watcher=$!

wait_for_hash() {
  expected=$(openssl dgst -sha256 -r "$temporary/$1.crt" | awk '{print $1}')
  attempts=0
  while [ "$attempts" -lt 50 ]; do
    actual=$(cat "$temporary/certs/.tls-applied.sha256" 2>/dev/null || true)
    [ "$actual" = "$expected" ] && return 0
    attempts=$((attempts + 1))
    sleep 0.2
  done
  cat "$temporary/watch.log" >&2
  echo "Nginx did not acknowledge $1 certificate" >&2
  return 1
}

wait_for_hash first
[ "$(stat -c %a "$temporary/certs/.tls-applied.sha256")" = 644 ]
touch "$MOCK_NGINX_FAIL_ONCE"
cp "$temporary/second.key" "$temporary/certs/tls.key.tmp"
cp "$temporary/second.crt" "$temporary/certs/tls.crt.tmp"
mv "$temporary/certs/tls.key.tmp" "$temporary/certs/tls.key"
mv "$temporary/certs/tls.crt.tmp" "$temporary/certs/tls.crt"
wait_for_hash second
[ ! -f "$MOCK_NGINX_FAIL_ONCE" ]

# Re-uploading the same certificate deletes the acknowledgement in the API.
rm "$temporary/certs/.tls-applied.sha256"
wait_for_hash second
[ "$(wc -l < "$temporary/nginx.log")" -ge 3 ]
echo "Certificate startup, replacement, and retry reconciliation passed."