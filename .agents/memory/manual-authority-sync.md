---
name: Manual authority versus directory sync
description: Decision on how human-assigned CIO authority interacts with imported directory groups.
---

Manually granted or revoked CIO authority takes precedence over future directory-group synchronization. An untouched imported account can still follow its directory group; ordinary profile or leadership edits must not silently convert that account to a manual CIO override.

**Why:** Local administrators and delegated leaders must be able to grant CIO authority to imported users, and that grant must not disappear at the next sign-in. Conversely, an unrelated profile save must not freeze a user's directory-derived authority.

**How to apply:** When changing identity or permission flows, distinguish an explicit CIO change from a save that repeats the current CIO value. Preserve the three-state distinction between directory-managed authority and explicit true/false overrides.