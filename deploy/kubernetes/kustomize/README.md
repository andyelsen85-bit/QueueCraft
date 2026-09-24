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

Replace every `REPLACE_WITH_KUBESEAL_OUTPUT` value with output encrypted for
your cluster and the `queuecraft` namespace. For example, prepare a temporary
Secret and seal it:

```bash
kubectl -n queuecraft create secret generic api-env-secret \
  --from-literal=DATABASE_URL='postgresql://queuecraft:<url-encoded-password>@pg:5432/queuecraft' \
  --from-literal=SESSION_SECRET='<at-least-32-random-characters>' \
  --from-literal=APP_ENCRYPTION_KEY='<64-random-hex-characters>' \
  --dry-run=client -o yaml |
kubeseal --format yaml > api-env-sealed.yml
```

Do the same for `pg-env` in each environment. Both `DATABASE_URL` values must
point to the in-cluster `pg:5432` Service and use the matching `POSTGRES_DB`,
`POSTGRES_USER`, and `POSTGRES_PASSWORD` from that environment's `pg-env`
SealedSecret. Seal each environment's secrets for its own cluster and namespace;
never reuse test credentials in production.

The production overlay now provisions a new database volume rather than
connecting to the previously documented external PostgreSQL service. It does
not migrate existing external database contents; export and restore that data
before changing a running production deployment's `DATABASE_URL`.

The base `regcred.yml` intentionally contains
`REPLACE_WITH_DOCKER_CONFIG_JSON`; the uploaded archive included a live registry
credential, which must not be copied. Replace this value with your own Docker
configuration before deployment. AD FS, LDAPS, SMTP, and CA certificates are
configured after first login in QueueCraft Settings.

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