---
name: Calendar member filtering
description: How to represent topic and milestone assignments when narrowing the calendar to one member.
---

Filter topic schedule bars by topic assignment and milestone rows by milestone assignment independently. A parent topic row may remain as context for a matching milestone without showing the topic's own schedule bar when that member is not assigned to the topic.

**Why:** A member can be assigned to a milestone without being assigned to its topic, or to a topic without being assigned to every milestone. Inheriting the topic's assignment for all milestones would show unrelated work.

**How to apply:** Treat primary topic assignees and collaborators as topic assignments; treat milestone assignees, allocations, and explicit collaborator-to-milestone links as milestone assignments. Keep the parent label for navigation and grouping, not as proof of topic assignment.