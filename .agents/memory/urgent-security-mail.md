---
name: Urgent security mail and digests
description: Why QueueCraft security alerts must remain separate from user-configurable notification digests.
---

Keep break-glass validation alerts immediately eligible for delivery, even when ordinary topic notifications are batched over a configurable interval. Do not include urgent security alerts in the digest cache deletion control.

**Why:** A user-configurable digest delay or cache-clear action should not postpone or discard an alert about exceptional validation authority being used.

**How to apply:** Any future batching, retry, queue visibility, or cleanup change involving notification mail must explicitly preserve this distinction. The messages may share email styling, but not delivery timing or deletion policy.