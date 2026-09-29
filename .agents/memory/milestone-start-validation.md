---
name: Milestone starts and topic validation
description: The approval boundary and status rule when milestone work begins.
---

When the first milestone by planned start date moves to In Progress or Completed, promote an Open topic to In Progress. Do not overwrite another topic state. A topic still pending validation must not start milestone work merely to trigger the promotion.

**Why:** The user wants topic status to reflect the start of milestone work, but that automatic change must not bypass the separate validation approval process.

**How to apply:** Preserve the validation gate in any new milestone-status entry point; determine "first" chronologically rather than by insertion order. Update the topic and milestone together so lists and calendars do not disagree.