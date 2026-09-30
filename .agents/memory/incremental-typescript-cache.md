---
name: Incremental TypeScript cache after package changes
description: Distinguishing stale type errors from real errors after temporarily changing package versions.
---

When dependency graph changes are reverted, incremental TypeScript state can continue reporting errors from types no longer in the active graph. Compare a non-incremental or fresh-build-info check before editing source code to address those errors.

**Why:** A cached check continued to report schema incompatibilities after the original generator was restored; a fresh check passed without source changes.

**How to apply:** If only the cached check fails after package changes, clear the generated TypeScript build info and rerun the normal check. Do not treat this as proof of a source-level regression.