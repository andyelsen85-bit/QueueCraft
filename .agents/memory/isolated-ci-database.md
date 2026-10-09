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

Use a fresh disposable database for a complete regression pass after any failed test run.

**Why:** Failed assertions can leave notification outbox rows and other fixtures behind, causing unrelated count-based checks to fail on the next run.

**How to apply:** Recreate the isolated database and apply migrations rather than weakening assertions or modifying the app's real data to accommodate leftover fixtures.

Run disposable PostgreSQL as a foreground server in a managed background shell task when it must survive multiple tool calls.

**Why:** A server daemonized by pg_ctl from a completed shell did not survive into the next tool call, causing connection refusal.

**How to apply:** Keep the temporary server attached to its background task and stop that task after verification. Do not replace or restart the app's database.