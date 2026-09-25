---
name: Legacy milestone status
description: Why the old Blocked milestone value remains while the user-facing status choices use Returned.
---

Offer Not Started, In Progress, Returned, and Done for milestone status changes. Preserve any historically Blocked milestone as Blocked until someone explicitly changes it; do not relabel it as Returned.

**Why:** Blocked and Returned have different meanings. PostgreSQL enums cannot safely drop an existing value without a disruptive type replacement, and production may contain historical Blocked records even when development has none.

**How to apply:** Keep legacy values readable, display the existing value for old records, and restrict new choices to the four requested statuses. Only plan removal of Blocked with an explicit data policy and migration.