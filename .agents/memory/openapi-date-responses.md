---
name: OpenAPI date responses
description: Date-only values returned by QueueCraft's generated response parser require normalization in date-only UI logic.
---

The generated response validation for OpenAPI `format: date` coerces values to JavaScript Dates, then JSON serializes them as full ISO timestamps. A browser may therefore receive a full timestamp even though the database stores a date-only value.

**Why:** Using a response value directly as an HTML date input or appending a time suffix for date arithmetic can produce an invalid date. This surfaced when a prerequisite finish was used to calculate a dependent topic's schedule.

**How to apply:** Normalize API response dates to their `YYYY-MM-DD` prefix before feeding date-only controls or UTC day arithmetic. Keep server-side date calculations in UTC days and cast parameterized day offsets to integers in PostgreSQL date arithmetic to avoid operator ambiguity.