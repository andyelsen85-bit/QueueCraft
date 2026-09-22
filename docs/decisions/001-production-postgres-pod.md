# ADR 001: Production PostgreSQL runs in the QueueCraft Kubernetes namespace

## Status

Approved exception.

## Decision

QueueCraft production uses PostgreSQL 16 as a single-replica StatefulSet with a persistent volume in the same Kubernetes namespace as the application. This replaces the Management Application Baseline default of an externally managed production database.

## Why

The owner explicitly accepted the operational tradeoff because QueueCraft contains low-criticality coordination data. Keeping the database beside the application simplifies this deployment.

## Consequences and controls

- Persistent storage is mandatory; ephemeral container storage is prohibited.
- PostgreSQL credentials and `DATABASE_URL` remain Kubernetes Secrets and are never committed.
- The cluster operator owns scheduled volume/database backups and restore exercises.
- The application migration Job must complete before API rollout.
- The database pod must not be exposed outside the namespace.
- Loss of the cluster and its backup target can still cause data loss; this is an accepted exception, not equivalent resilience to managed PostgreSQL.
- Revisit this decision if QueueCraft begins storing critical, regulated, or non-reconstructible data.