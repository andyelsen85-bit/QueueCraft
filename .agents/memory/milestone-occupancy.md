---
name: Milestone occupancy transition
description: Why QueueCraft's historical topic allocations do not count or auto-convert to milestones.
---

Old topic-level allocation percentages remain available for reference but stop contributing to occupancy immediately. Do not distribute them automatically to milestones or keep counting them as a transitional fallback.
Milestone percentages may be planned while a topic is awaiting validation, but must not affect anyone's occupancy until that topic is validated.

**Why:** The user explicitly chose immediate exclusion while retaining the old records. A topic can have multiple milestones, so the old percentage cannot be mapped to a particular milestone reliably. The user also wants to plan milestones before approval without affecting reported capacity prematurely.

**How to apply:** When changing occupancy calculations, migrations, imports, or reports, treat old topic percentages as historical data and count per-person milestone allocations only for validated topics (plus BAU). Keep planned allocations visible and editable before validation.