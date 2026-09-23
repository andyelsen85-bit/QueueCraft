# QueueCraft

QueueCraft routes internal IT topics through Service Head validation to one accountable owner, with topic-scoped collaborators and parallel milestones.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/queuecraft run dev` — run the QueueCraft frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/queuecraft.ts` — domain schema
- `artifacts/api-server/src/routes/queuecraft.ts` — API implementation
- `artifacts/queuecraft/` — QueueCraft frontend
- `deploy/docker/` — hardened image definitions
- `deploy/kubernetes/kustomize/` — Change Manager deployment package
- `docs/decisions/` — architecture decisions

## Architecture decisions

- Every topic requires Service Head or Service Head Deputy validation; Role Leads and their optional deputies manage execution but never validate.
- Validation break-glass is limited to CIO and service authorities and applies only to validation.
- Additional collaborators receive topic-level access without becoming members of the owning role.
- Production PostgreSQL is externally managed and supplied through the production SealedSecret. The test overlay includes an isolated PostgreSQL instance for validation.
- AD FS/LDAPS and SMTP are production integration boundaries; the preview identity is intentionally non-production.

## Product

- Operational dashboard and recent activity
- Personal work view
- Topic creation, filtering, assignment, collaborators, and milestones
- Service authority validation queue and audited break-glass flow
- Department, role, leader, deputy, and member directory

## User preferences

- Use a fresh modern technical identity, not the corporate visual identity.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
