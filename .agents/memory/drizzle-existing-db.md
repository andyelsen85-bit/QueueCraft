---
name: Drizzle migrations on an existing database
description: How to handle QueueCraft schema changes when the development database predates Drizzle's migration journal.
---

The development database may already contain historical schema while its Drizzle migration journal is empty. Do not blindly run the full migration chain against it. For new migrations, keep deterministic data-conversion SQL and ensure the matching post-migration snapshot and journal entry stay aligned.

**Why:** An out-of-sync journal, live schema, and snapshot can replay already-applied history or make later schema generation propose duplicate operations.

**How to apply:** Check live schema and journal state first. Apply only safe, reviewed SQL needed for development, retain migration files for fresh environments, and run the schema generator afterward; it must report no pending schema changes.