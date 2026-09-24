---
name: Shared TLS volume ownership
description: Non-root group ownership behavior for QueueCraft's API-to-Nginx certificate handoff
---

On Kubernetes, the API and Nginx sidecar share a persistent certificate volume and a supplemental filesystem group. A non-root API process can give a new private-key file group-read permission for Nginx only when its configured group is actually among the process's permitted groups. In local development, attempting the same group change can fail with EPERM, even when the process owns the file.

**Why:** A local certificate installation check exposed an EPERM from `chown` after validation had passed. Making the shared group conditional allows local certificate checks without weakening production key permissions.

**How to apply:** When modifying the certificate handoff, keep the deployment filesystem group and the Nginx group aligned. Verify both the locally unconfigured path and the production group-aware path; do not make the private key world-readable to work around an ownership problem.