---
name: Isolated CI database checks
description: Why and how to reproduce GitHub Actions tests that mutate QueueCraft data safely.
---

Run database-mutating CI tests against a disposable PostgreSQL instance rather than the workspace's development database. Replit may inherit a PostgreSQL client user that differs from the role created by a temporary local instance, so select the temporary instance's role explicitly. Set its Unix socket directory to `/tmp` if the server cannot start with its default socket path.

**Why:** The API suite creates members, topics, and sessions and exercises backup restoration. Running it against the app's development database could modify real work. In this environment, the default local PostgreSQL socket and inherited client role also prevented a disposable instance from working until overridden.

**How to apply:** When reproducing CI failures, create an isolated temporary database, point the test process at it, then stop and remove it. Do not use the active application's database merely because it is already configured.

Check that the test runner actually includes the route integration suite. A green package test command can cover only nested tests when a shell glob misses top-level tests. The route suite also needs CI fixture seeding on a fresh disposable database; without it, requests fail as unauthorized for reasons unrelated to the change.

## Immutable audit fixtures

Audit-generating test writes are not fully reversible. Keep synthetic actors referenced by immutable audit history until the disposable database is discarded; do not bypass audit protections to remove fixtures.

**Why:** Actor cleanup can require deleting protected audit entries, which is deliberately blocked.

**How to apply:** Expire temporary sessions and remove reversible fixtures, then discard the entire isolated database after the test run.