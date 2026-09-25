---
name: Milestone finish choice
description: Meaning and intent of the topic finish prompt when milestone schedules run late.
---

Interpret “last finished milestone date” in the scheduling request as the latest planned milestone target date across the topic, not a historical completion timestamp. When a milestone edit or its downstream shifts extend beyond the topic's estimated finish, allow the editor to extend the estimate or keep it unchanged; do not silently force either option.

**Why:** The user described a late hardware delivery changing installation and subsequent planned dates. Completed-at timestamps would not provide a useful future finish estimate, and the user asked for a choice rather than automatic extension.

**How to apply:** Recalculate the latest projected target after dependency shifts, then ask before saving a newly exceeded topic estimate. Keep the editor's explicit decision with the schedule change.