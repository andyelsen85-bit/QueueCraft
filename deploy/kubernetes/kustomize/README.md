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

### Generate the production SealedSecrets

Use the same `kubectl create secret | kubeseal` approach as for test. Run these
commands on a trusted administration machine with `kubectl`, `kubeseal`, and
access to the **production** cluster. First check the available contexts:

```bash
kubectl config get-contexts
```

For a **new** production environment only, generate three *different* values
and store them in your approved secret store. Reuse the existing values for an
established deployment:

```bash
openssl rand -hex 24  # production POSTGRES_PASSWORD (URL-safe)
openssl rand -hex 32  # production SESSION_SECRET
openssl rand -hex 32  # production APP_ENCRYPTION_KEY
```

Set the production context and find the **Service** for the Sealed Secrets
controller. The default `sealed-secrets-controller` name is not present in
every cluster. In the listing, use the `NAMESPACE` and `NAME` columns of the
matching Service (not the Deployment name). Ask the cluster administrator if
the Service is not listed or you cannot list services; production may not have
the Sealed Secrets controller installed. Do not use the test cluster's
certificate:

```bash
CONTEXT=your-prod-kube-context
kubectl --context "$CONTEXT" get svc -A | grep -Ei 'sealed|seal'

CONTROLLER_NAMESPACE='namespace-from-listing'
CONTROLLER_NAME='service-name-from-listing'
kubeseal --context "$CONTEXT" \
  --controller-namespace "$CONTROLLER_NAMESPACE" \
  --controller-name "$CONTROLLER_NAME" --fetch-cert >/dev/null
```

Once certificate lookup succeeds, generate the PostgreSQL SealedSecret.
Replace `<prod-password>` with the newly generated or existing database
password; leaving the angle-bracket placeholder unchanged would seal the
literal placeholder instead:

```bash
kubectl --context "$CONTEXT" -n queuecraft create secret generic pg-env \
  --from-literal=POSTGRES_DB=queuecraft \
  --from-literal=POSTGRES_USER=queuecraft \
  --from-literal=POSTGRES_PASSWORD='<prod-password>' \
  --dry-run=client -o yaml |
kubeseal --context "$CONTEXT" \
  --controller-namespace "$CONTROLLER_NAMESPACE" \
  --controller-name "$CONTROLLER_NAME" \
  --format yaml > /tmp/queuecraft-prod-pg-env-sealed.yml
```

Generate the API SealedSecret with the **same** database password and the two
*different* values generated above. **Replace every angle-bracket example
before running the command.** In particular, the literal
`<prod-app-encryption-key>` is 25 characters and will cause the API to fail
at startup if sealed instead of a real 64-character hex key:

```bash
kubectl --context "$CONTEXT" -n queuecraft create secret generic api-env-secret \
  --from-literal=DATABASE_URL='postgresql://queuecraft:<prod-password>@pg:5432/queuecraft' \
  --from-literal=SESSION_SECRET='<prod-session-secret>' \
  --from-literal=APP_ENCRYPTION_KEY='<prod-app-encryption-key>' \
  --dry-run=client -o yaml |
kubeseal --context "$CONTEXT" \
  --controller-namespace "$CONTROLLER_NAMESPACE" \
  --controller-name "$CONTROLLER_NAME" \
  --format yaml > /tmp/queuecraft-prod-api-env-sealed.yml
```

Copy the three `spec.encryptedData` values from the first generated file into
`overlays/prod/pg-env.yml`. Copy the three from the second into the
**SealedSecret section** of `overlays/prod/api-env.yml` (keep its ConfigMap
section). Do not copy plaintext or replace `api-env.yml` with only the
generated SealedSecret. Running `kubeseal` only writes a local output file;
the cluster's Secret will not change until the updated SealedSecret is
applied and reconciled. Existing pods also keep their old environment values
until they are recreated.

```bash
grep -n REPLACE_WITH_KUBESEAL_OUTPUT deploy/kubernetes/kustomize/overlays/prod/{pg-env,api-env}.yml
kubectl kustomize deploy/kubernetes/kustomize/overlays/prod >/dev/null
```

The `grep` command should print **nothing** after all six values are replaced.
For test, use its **own** context, password, session secret, and encryption key,
and copy its newly generated values into `overlays/test/` instead. SealedSecret
ciphertext cannot be copied from test to production. The literal commands
above can expose the supplied plaintext in shell history and process listings;
use your organisation's secure secret-entry procedure when running them.

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
SealedSecret. Its `REPLACE_WITH_DOCKER_CONFIG_JSON` is not covered by the two
sealing commands above. The uploaded archive included a live registry credential,
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
The API and migration containers run as numeric UID/GID 10001; this must match
their container images because Kubernetes cannot verify `runAsNonRoot` when an
image declares a user by name.

## HTTPS certificate renewals

Apply the current deployment manifest when setting up or upgrading the cluster:
both the API and web containers must mount `longhorn-queuecraft-certs-pvc` at
`/etc/nginx/certs`, and the API needs `TLS_CERT_DIR=/etc/nginx/certs` and
`TLS_CERT_GID=101`. Publishing or mirroring a new container image does not add
missing Kubernetes environment variables or volume mounts.
If deploying from `deliverables/queuecraft-kubernetes-deployment.zip`, transfer
the refreshed package to your administration machine before the next rollout;
an older copy lacks the API certificate mount. CI checks that the ZIP's base
deployment stays in sync with the source manifest.

After this one-time setup, renew the certificate in **Settings → Organization
PKI / HTTPS**. A successful upload replaces the certificate on the shared
volume and waits for Nginx to confirm its reload; no `kubectl` command or pod
restart is needed for subsequent renewals. If Settings says the certificate
was saved but not applied, check that the running deployment still matches
the shared-volume configuration above before trying another upload.