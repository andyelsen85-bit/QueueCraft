---
name: Dependency audit repairs
description: Why to verify generated client compatibility before broad package upgrades for security findings.
---

For security findings inside the API generator's dependency tree, verify a generator upgrade by regenerating clients and typechecking the entire workspace. If the upgrade changes generated schema types incompatibly with the existing forms, use narrowly scoped patched transitive dependencies rather than refactoring the application just to silence an audit.

**Why:** A newer generator release changed schema typings consumed by forms even though the security findings were confined to nested packages. A narrow patch preserved the app's contract.

**How to apply:** Keep the dependency audit, frozen-lockfile install, codegen, and full typecheck together when investigating package-security failures. Never lower the audit threshold to make CI pass.