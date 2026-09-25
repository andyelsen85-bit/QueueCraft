---
name: Prerequisite edits and started work
description: The scheduling and work-state rationale behind changing a topic's prerequisite.
---

Changing a topic's prerequisite is a scheduling operation, not just a relationship edit: preserve its existing planned duration and move its own milestones and successor schedules by the resulting date changes. Clearing a prerequisite should leave planned dates alone. The user explicitly wants pending-validation prerequisites without an estimated finish to be selectable; keep dependent dates tentative (or blank) until a finish is added, then anchor the start and preserve any tentative period.

**Why:** Replacing only the link would leave estimates and milestone occupancy inconsistent. A missing finish cannot supply a reliable start date, but it should not prevent planning the dependency. Attaching an unfinished prerequisite to work that has already started would retroactively violate the rule that dependent work cannot begin before completion.

**How to apply:** Keep date shifts and the link change in one transaction. When a prerequisite first receives a finish, align its dependents and shift tentative milestones and downstream schedules together. Permit new unfinished prerequisites only before topic or milestone work starts; still allow a link to be cleared without changing its dates.