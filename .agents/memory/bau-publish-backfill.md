---
name: BAU legacy values on publish
description: Preserve prior BAU allocations when a schema-only production sync does not execute data backfills.
---

For named BAU tasks, treat a member with an empty task list and a positive legacy BAU percentage as having one "Standard Operations" task at read time. Keep the explicit migration backfill for environments that execute Drizzle migrations.

**Why:** Replit-managed Publish synchronizes schema from development to production, but does not execute custom data-conversion SQL. A new task column can receive its empty default on an existing production row that still has a positive BAU percentage. Without a compatibility read, an unrelated member edit could erase that allocation.

**How to apply:** When changing how existing stored values are represented, check both migration-driven and schema-diff publish paths. Preserve legacy values in reads and unrelated writes until the new representation is explicitly saved.