---
name: Prerequisite edits and started work
description: The scheduling and work-state rationale behind changing a topic's prerequisite.
---

Changing a topic's prerequisite is a scheduling operation, not just a relationship edit: preserve its existing planned duration and move its own milestones and successor schedules by the resulting date changes. Clearing a prerequisite should leave planned dates alone.

**Why:** Replacing only the link would leave estimates and milestone occupancy inconsistent. Attaching an unfinished prerequisite to work that has already started would retroactively violate the rule that dependent work cannot begin before completion.

**How to apply:** Keep date shifts and the link change in one transaction. Permit new unfinished prerequisites only before topic or milestone work starts; still allow a link to be cleared without changing its dates.