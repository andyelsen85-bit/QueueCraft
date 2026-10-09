---
name: My Work current-date view
description: User intent for separating running assignments from future planning in My Work.
---

My Work needs an additional Assigned Running tab for topics and milestones for the actual date, not upcoming or planned work in the future.

**Why:** The user explicitly requested a current-day work view separate from future assignments.

**How to apply:** Keep future planning available in the existing tabs. The current-day view must respect assignment identity and the scheduled period, normalize date responses, and update as the date changes.

Assigned Running must ignore topic and milestone status: show all assignments whose scheduled dates include today, including work not yet started.

**Why:** The user clarified that filtering for In Progress prevents users from seeing milestones they need to start today.

**How to apply:** Use the full assignment collections, not the other tabs' status-filtered collections. Status remains visible on cards but must not determine inclusion in this tab.

My Work must link milestones to their parent topic and allow topic and milestone status changes there.

**Why:** The user wants to act on assigned work without navigating away solely to change its status.

**How to apply:** Retain the existing management, validation and prerequisite rules; a shortcut must not bypass approval or grant extra access.
