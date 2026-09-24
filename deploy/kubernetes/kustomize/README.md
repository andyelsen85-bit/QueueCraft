# QueueCraft Kubernetes deployment

This directory mirrors the supplied Change Manager layout: a shared base and
separate test and production overlays, all targeting the `queuecraft` namespace.
There is no Ingress. The `web` Service exposes HTTP on port 80 and HTTPS on port
443.
Use the overlays in separate cluster contexts; they define the same namespace
and resource names and must not both be applied to one namespace.

## Application images

GitHub Container Registry publishes these images:

```text
ghcr.io/andyelsen85-bit/queuecraft-api:<tag>
ghcr.io/andyelsen85-bit/queuecraft-web:<tag>
ghcr.io/andyelsen85-bit/queuecraft-builder:<tag>
```

The overlays expect the mirrored images at:

```text
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-api:<tag>
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-web:<tag>
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-builder:<tag>
```

Change the `newName` and `newTag` entries in each overlay if your Nexus
repository or release tag differs.

## Upstream build/runtime images

Mirror these too if the Linux build host cannot reach Docker Hub:

```text
docker.io/library/node:24-alpine
docker.io/library/node:24-bookworm-slim
docker.io/library/nginx:1.27-alpine
docker.io/library/postgres:16.4-alpine
```

Both PostgreSQL overlays currently expect the mirror at:

```text
srvnexusint.hopital.chdn.lan:8443/postgres:16.4-alpine
```

## Mirror the QueueCraft release images

Set `SOURCE_TAG` to a GitHub tag such as `v1.0.0`, `main`, or a generated SHA
tag such as `sha-0123456`. Set `TARGET_TAG` to `test` or `prod` to match the
corresponding overlay.

```bash
SOURCE_TAG=v1.0.0
TARGET_TAG=test

docker login ghcr.io
docker login srvnexusint.hopital.chdn.lan:6443

for image in api web builder; do
  docker pull ghcr.io/andyelsen85-bit/queuecraft-${image}:${SOURCE_TAG}
  docker tag \
    ghcr.io/andyelsen85-bit/queuecraft-${image}:${SOURCE_TAG} \
    srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-${image}:${TARGET_TAG}
  docker push srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-${image}:${TARGET_TAG}
done
```

## Required secrets

The overlay files already define the same ConfigMap and SealedSecret structure
as the supplied example:

```text
overlays/test/api-env.yml  DATABASE_URL, SESSION_SECRET, APP_ENCRYPTION_KEY
overlays/test/pg-env.yml   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
overlays/prod/api-env.yml  DATABASE_URL, SESSION_SECRET, APP_ENCRYPTION_KEY
overlays/prod/pg-env.yml   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
```

`SESSION_SECRET` must be at least 32 random characters. QueueCraft encrypts
runtime AD FS, LDAPS, and SMTP settings with the independent
`APP_ENCRYPTION_KEY`, which must contain at least 32 random bytes (64
hexadecimal characters or an equivalent base64 value). Keep the two values
independent and do not use a recognizable placeholder in production.
Retain the active `APP_ENCRYPTION_KEY` with application backups because runtime
settings remain encrypted in the export. During an upgrade from an older
QueueCraft release, retain the old `SESSION_SECRET` until the application has
read and migrated the legacy ciphertext.

### Replace every SealedSecret placeholder

Run the following **Bash** commands from the repository root on a machine with
`kubeseal`, `kubectl`, and access to the target cluster. Set `OVERLAY` and
`CONTEXT` for **test**, run the whole block, then change them to the **prod**
overlay and production context and run it again. If your Sealed Secrets
controller is not named `sealed-secrets` in `kube-system`, adjust the two
controller variables. The controller's public certificate is fetched from the
selected cluster; no plaintext secret is written to a file or passed as a
command-line argument. Prompts read directly from the terminal without echo.

For a **new** environment, generate three independent values and save them in
your approved secret store before sealing (do not regenerate values for an
existing deployment):

```bash
openssl rand -hex 24  # POSTGRES_PASSWORD (URL-safe)
openssl rand -hex 32  # SESSION_SECRET
openssl rand -hex 32  # APP_ENCRYPTION_KEY
kubectl config get-contexts
```

```bash
(
  set -euo pipefail
  OVERLAY=prod                       # change to test for the test cluster
  CONTEXT=your-prod-kube-context     # use the matching cluster context
  CONTROLLER_NAMESPACE=kube-system
  CONTROLLER_NAME=sealed-secrets-controller
  NAMESPACE=queuecraft
  DIR="deploy/kubernetes/kustomize/overlays/$OVERLAY"
  CERT="$(mktemp)"
  trap 'rm -f "$CERT"' EXIT

  kubeseal --context "$CONTEXT" \
    --controller-namespace "$CONTROLLER_NAMESPACE" \
    --controller-name "$CONTROLLER_NAME" --fetch-cert > "$CERT"

  seal_field() {
    local file="$1" secret="$2" key="$3" value sealed tmp
    grep -Fq "    $key: REPLACE_WITH_KUBESEAL_OUTPUT" "$file" || {
      printf 'Missing placeholder: %s in %s\n' "$key" "$file" >&2
      return 1
    }
    IFS= read -r -s -p "$OVERLAY $key: " value </dev/tty
    printf '\n' >/dev/tty
    test -n "$value" || { printf 'Empty value: %s\n' "$key" >&2; return 1; }
    sealed="$(printf '%s' "$value" | kubeseal --raw --cert "$CERT" \
      --scope strict --namespace "$NAMESPACE" --name "$secret")"
    unset value
    test -n "$sealed" || { printf 'Sealing failed: %s\n' "$key" >&2; return 1; }
    tmp="$(mktemp "$file.XXXXXX")"
    sed "s|^    $key: REPLACE_WITH_KUBESEAL_OUTPUT$|    $key: $sealed|" "$file" > "$tmp"
    mv "$tmp" "$file"
  }

  seal_field "$DIR/pg-env.yml" pg-env POSTGRES_DB
  seal_field "$DIR/pg-env.yml" pg-env POSTGRES_USER
  seal_field "$DIR/pg-env.yml" pg-env POSTGRES_PASSWORD
  seal_field "$DIR/api-env.yml" api-env-secret DATABASE_URL
  seal_field "$DIR/api-env.yml" api-env-secret SESSION_SECRET
  seal_field "$DIR/api-env.yml" api-env-secret APP_ENCRYPTION_KEY

  if grep -q REPLACE_WITH_KUBESEAL_OUTPUT "$DIR/api-env.yml" "$DIR/pg-env.yml"; then
    printf 'Unsealed values remain in %s\n' "$DIR" >&2
    exit 1
  fi
  kubectl kustomize "$DIR" >/dev/null
  printf 'Sealed all six values in %s\n' "$DIR"
)
```

`DATABASE_URL` must point to the in-cluster `pg:5432` Service, for example
`postgresql://queuecraft:<password>@pg:5432/queuecraft` when using the
URL-safe hexadecimal password generated above (URL-encode other passwords). Its
database name, user, and password must match that environment's `POSTGRES_DB`,
`POSTGRES_USER`, and `POSTGRES_PASSWORD`. Use different passwords, session
secrets, and encryption keys for test and production. Store the plaintext
values securely outside Git; retain the existing `APP_ENCRYPTION_KEY` (and
legacy `SESSION_SECRET` during migration) when updating an established
environment. Each ciphertext is bound to its Secret name, namespace, and
cluster key; do not copy sealed values between environments.

The production overlay now provisions a new database volume rather than
connecting to the previously documented external PostgreSQL service. It does
not migrate existing external database contents; export and restore that data
before changing a running production deployment's `DATABASE_URL`.

The base `regcred.yml` contains a **separate plain Kubernetes Secret**, not a
SealedSecret. Its `REPLACE_WITH_DOCKER_CONFIG_JSON` is not covered by the six
commands above. The uploaded archive included a live registry credential,
which must not be copied. Supply your registry credential through your secure
deployment process rather than committing a plaintext Docker configuration.
AD FS, LDAPS, SMTP, and CA certificates are configured after first login in
QueueCraft Settings.

## Render and deploy

```bash
kubectl kustomize deploy/kubernetes/kustomize/overlays/test
kubectl apply -k deploy/kubernetes/kustomize/overlays/test

kubectl kustomize deploy/kubernetes/kustomize/overlays/prod
kubectl apply -k deploy/kubernetes/kustomize/overlays/prod
```

The builder image runs database migrations as an init container before the API.
Both overlays include PostgreSQL and a Longhorn PVC in their respective
clusters. Like test, production defines one PostgreSQL replica and a 2Gi PVC;
this deployment package does not configure automated database backups or
high availability. Establish those separately before relying on it for
production data.

The web container runs as UID/GID 101 and retains ports 80 and 443. Kubernetes
adds only `NET_BIND_SERVICE` so the non-root Nginx process can bind those ports.
The certificate PVC is mounted with pod `fsGroup: 101` so the entrypoint can
reuse or generate certificates without root access.