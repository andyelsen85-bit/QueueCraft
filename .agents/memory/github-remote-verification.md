---
name: GitHub remote verification
description: Verify live remote state before retrying a push or creating a replacement commit.
---

Check the live GitHub branch through the connected API before concluding that a local commit has not reached GitHub.

**Why:** The live branch already contained the exact local commit and had triggered CI even though the local remote-tracking ref was stale and a shell push returned an authentication error. The mechanism that synchronized it was not established.

**How to apply:** Compare the live branch SHA with local HEAD and inspect runs for that exact SHA. Avoid duplicate commits or credential changes solely because a shell push fails.

## Push approval

Do not ask again for permission to push this project's changes to GitHub main.

**Why:** The user approved pushing and explicitly said, “of course do not ask again.”

**How to apply:** Push completed, verified changes to main without another confirmation question. Continue verifying live remote state and avoid force pushes.

## Connector request limits

Git object uploads can hit the connector proxy's per-project request limit before GitHub's own quota. Throttle batch uploads and honor `Retry-After` on HTTP 429 instead of treating the error as an authorization failure.

**Why:** Concurrent blob uploads were rejected by the proxy while the GitHub connection remained authorized.

**How to apply:** Upload blobs sequentially or with bounded concurrency, verify their hashes, and update the branch only after the exact tree and commit have been verified.

## Complete source payloads

Validate source blob hashes before uploading, and read large payloads in bounded chunks rather than relying on a requested output budget.

**Why:** Programmatic shell output was capped despite a larger requested budget, silently shortening Base64 payloads. Pipe reads can also return partial blocks.

**How to apply:** Use bounded full-block reads for piped content and verify the Git blob hash of the decoded, reassembled bytes before uploading. A successful shell call alone does not prove that all bytes were returned.
