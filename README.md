# QueueCraft

QueueCraft is an internal IT topic-routing application. Service Heads validate
topics, role leads assign accountable owners, collaborators receive
topic-scoped access, and teams track milestones through completion.

## Capabilities

- Service Head validation queue and audited break-glass validation
- Topic creation, filtering, assignment, collaborators, and milestones
- Department, role, deputy, and member directory management
- Operational dashboard, personal work view, and recent activity
- AD FS OpenID Connect, local bootstrap administrator, and LDAPS authentication
- PostgreSQL-backed, administratively revocable sessions and centrally protected audit records

## Security and recovery

Passwords use scrypt with timing-safe comparison. OIDC uses authorization code
flow with PKCE, state, and nonce. CSRF protection is global, CORS is
allowlisted, and authentication endpoints are rate limited.

Runtime AD FS, LDAPS, and SMTP credentials are encrypted with AES-256-GCM using
the independent `APP_ENCRYPTION_KEY`; it must never be reused as
`SESSION_SECRET`. Sensitive mutations, including settings changes, are written
to the audit log. Database triggers prevent audit-log update, delete, and
truncate operations.

Administrators can use the in-app backup and restore endpoints to export and
restore the complete QueueCraft schema. Restores are transactional and the
backup coverage test detects schema tables omitted from the export list. The
application backup is an additional recovery mechanism; production PostgreSQL
remains centrally backed up and monitored by CHdN.
Every restore revokes all existing server-side sessions so restored membership
and authority take effect immediately.

Backups contain encrypted runtime settings. Retain the original
`APP_ENCRYPTION_KEY` with the backup or those settings cannot be decrypted
after restore. During migration from older releases, also retain the original
`SESSION_SECRET` until QueueCraft has read and re-encrypted the legacy settings.

Administrative recovery endpoints require the `settings.manage` capability:

```text
GET  /api/admin/backup
POST /api/admin/backup/restore
```

Administrators with directory-management authority can centrally invalidate a
member's PostgreSQL-backed sessions:

```text
DELETE /api/admin/sessions/:memberId
```

## Development

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/queuecraft run dev
pnpm run typecheck
pnpm run build
```

Required local environment values include `DATABASE_URL`, `SESSION_SECRET`,
and `APP_ENCRYPTION_KEY`. Production refuses to start without valid,
independent secret values.

## Container images

GitHub Actions builds and publishes the API, web, and migration/builder images
to GHCR. Images are mirrored to the CHdN registry for cluster deployment.
The API and web images use non-root runtime users. The web image preserves HTTP
and HTTPS listeners on ports 80 and 443 and generates a self-signed certificate
only when a mounted certificate is absent.

## Kubernetes deployment

The approved deployment package is the Change Manager Kustomize structure:

```text
deploy/kubernetes/kustomize/
├── base/
├── overlays/test/  # includes its own PostgreSQL
└── overlays/prod/  # includes its own PostgreSQL, matching test
```

Render or apply an overlay with:

```bash
kubectl kustomize deploy/kubernetes/kustomize/overlays/test
kubectl apply -k deploy/kubernetes/kustomize/overlays/test

kubectl kustomize deploy/kubernetes/kustomize/overlays/prod
kubectl apply -k deploy/kubernetes/kustomize/overlays/prod
```

Replace each `REPLACE_WITH_KUBESEAL_OUTPUT` value in the overlay secrets with
cluster-generated SealedSecret ciphertext. Do not commit plaintext database
credentials or encryption keys.

See [`deploy/kubernetes/kustomize/README.md`](deploy/kubernetes/kustomize/README.md)
for image mirroring, secret preparation, TLS certificate storage, and release
operations.