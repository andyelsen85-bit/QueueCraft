---
name: Urgent security mail and digests
description: Why QueueCraft security alerts must remain separate from user-configurable notification digests.
---

Keep break-glass validation alerts immediately eligible for delivery, even when ordinary topic notifications are batched over a configurable interval. Do not include urgent security alerts in the digest cache deletion control.

**Why:** A user-configurable digest delay or cache-clear action should not postpone or discard an alert about exceptional validation authority being used.

**How to apply:** Any future batching, retry, queue visibility, or cleanup change involving notification mail must explicitly preserve this distinction. The messages may share email styling, but not delivery timing or deletion policy.

SMTP delivery must never hold an open database transaction or the recipient advisory locks used by topic writes.

**Why:** An unreachable SMTP relay caused connection timeouts while the digest sender retained those locks, allowing saves and Pipeline activation to wait until nginx returned 504.

**How to apply:** Serialize workers across pods with a dedicated session-level advisory lock and release it reliably before returning the connection to the pool. Keep database updates short, bound SMTP waits and each pass, and retain urgent-first delivery and retryable outbox rows.