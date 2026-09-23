# QueueCraft Kubernetes deployment

This directory contains a Kustomize base and separate test and production
overlays. It follows the structure of the supplied Change Manager example while
keeping credentials out of Git.

## Application images

GitHub Container Registry publishes these images:

```text
ghcr.io/andyelsen85-bit/queuecraft-api:<tag>
ghcr.io/andyelsen85-bit/queuecraft-web:<tag>
ghcr.io/andyelsen85-bit/queuecraft-migration:<tag>
```

The overlays expect the mirrored images at:

```text
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-api:<tag>
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-web:<tag>
srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-migration:<tag>
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

The PostgreSQL overlays currently expect the mirror at:

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

for image in api web migration; do
  docker pull ghcr.io/andyelsen85-bit/queuecraft-${image}:${SOURCE_TAG}
  docker tag \
    ghcr.io/andyelsen85-bit/queuecraft-${image}:${SOURCE_TAG} \
    srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-${image}:${TARGET_TAG}
  docker push srvnexusint.hopital.chdn.lan:6443/infra/queuecraft-${image}:${TARGET_TAG}
done
```

## Required secrets

Create the namespace and the two required secrets before applying an overlay.
Do not commit their values.

```bash
kubectl create namespace queuecraft-test

kubectl -n queuecraft-test create secret docker-registry regcred \
  --docker-server=srvnexusint.hopital.chdn.lan:6443 \
  --docker-username='<username>' \
  --docker-password='<password>'

kubectl -n queuecraft-test create secret generic queuecraft-secrets \
  --from-literal=POSTGRES_USER='queuecraft' \
  --from-literal=POSTGRES_PASSWORD='<database-password>' \
  --from-literal=DATABASE_URL='postgresql://queuecraft:<url-encoded-password>@postgres:5432/queuecraft' \
  --from-literal=SESSION_SECRET='<at-least-32-random-characters>'
```

Repeat for `queuecraft-prod`. You can replace the plain Secret creation command
with your SealedSecret workflow. AD FS, LDAPS, SMTP, and their CA certificates
are configured after first login in QueueCraft Settings and are encrypted in
the database.

## Render and deploy

```bash
kubectl kustomize deploy/kubernetes/kustomize/overlays/test
kubectl apply -k deploy/kubernetes/kustomize/overlays/test

kubectl kustomize deploy/kubernetes/kustomize/overlays/prod
kubectl apply -k deploy/kubernetes/kustomize/overlays/prod
```

The migration image runs as an API init container before each API rollout.
PostgreSQL uses a persistent Longhorn volume and is not exposed outside its
namespace. Configure scheduled database or volume backups before production use.