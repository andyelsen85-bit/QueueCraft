# QueueCraft security foundation

QueueCraft follows the Management Application Baseline. The current product build establishes the OpenAPI contract, PostgreSQL domain schema, server-side scope checks for validation, a validation-only break-glass path with mandatory justification, structured redacted logging, restrictive request sizes, explicit CORS configuration, non-root containers, health probes, SBOM-producing image builds, and secret scanning.

## Authentication integration boundary

Production authentication is Microsoft AD FS OpenID Connect Authorization Code Flow with PKCE, with LDAPS as an approved fallback. QueueCraft must not grant roles from successful authentication alone; application roles and department scopes remain local authorization data.

The deployment must provide AD FS issuer/discovery URL, client ID, optional encrypted client secret, redirect URI, trusted internal CA material, and LDAP service-bind/search configuration before those adapters can be enabled. Authorization codes, tokens, and LDAP passwords must never be logged.

The development preview currently uses a fixed seeded Service Head identity so the business workflow can be evaluated before corporate identity endpoints are available. This preview identity is not an approved production authentication mechanism and must be disabled when the AD FS/LDAPS adapter is configured.

## Validation break-glass

`validation.break_glass` is limited to CIO, Service Head, and Service Head Deputy authority. It bypasses only the department-scope check during validation. It does not grant edit, assignment, completion, settings, or directory-management access outside normal scope. Every use requires a detailed reason and creates a high-visibility audit event; SMTP notification delivery must be enabled before production rollout.