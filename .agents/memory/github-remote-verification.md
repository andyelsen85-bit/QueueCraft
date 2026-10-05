---
name: GitHub remote verification
description: Verify live remote state before retrying a push or creating a replacement commit.
---

Check the live GitHub branch through the connected API before concluding that a local commit has not reached GitHub.

**Why:** The live branch already contained the exact local commit and had triggered CI even though the local remote-tracking ref was stale and a shell push returned an authentication error. The mechanism that synchronized it was not established.

**How to apply:** Compare the live branch SHA with local HEAD and inspect runs for that exact SHA. Avoid duplicate commits or credential changes solely because a shell push fails.
