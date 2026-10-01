---
name: backend
description: "Backend engineering method: contract-first API design, validation, authentication and authorization, business logic, error model, timeouts and idempotency, background jobs, caching as designed, observability (structured logs, metrics, health checks), and real endpoint tests including negative and authorization cases. Use for APIs, services, integrations, and server-side logic."
---

# Backend

## Purpose
Build validated, authorized, observable services whose behavior is proven by real calls.

## When to use
Building or changing APIs, services, jobs, integrations, auth, or server-side business logic.

## Procedure
1. Inspect existing services, conventions, and contracts before writing anything.
2. **Contract first:** define request/response shapes and the error model (typed errors, status codes, stable error codes).
3. **Validate** every input at the boundary (schema, allow-list). **Authenticate**, then **authorize server-side** on every request.
4. Implement business logic in small, testable units, separated from I/O.
5. **Failure handling:** timeouts on every outbound call, retries only for idempotent operations (backoff, jitter, cap), idempotency keys for retried writes and webhooks.
6. **Caching and background jobs** as designed by the architect (what, where, invalidation, TTL). Do not add a cache without a stated need.
7. **Observability:** structured logs with correlation IDs, metrics, health/readiness endpoints. Never log secrets or personal data.
8. **Tests:** call the endpoints for real (test client or curl): happy path, invalid input, boundaries, unauthenticated, unauthorized, downstream failure.

## Standards
- Third-party API behavior comes from official docs or actual responses, never memory.
- Secrets come from the environment; none in code or logs.
- Breaking API changes, destructive migrations, and paid-quota use go to the Boss (see `escalation`).
- Schema and index design belongs to `database-engineer`; infrastructure to `devops-engineer`.

## Verification
List the endpoints exercised (method, path, status, key assertion). Include negative and authorization cases. Record baseline test status before and after.

## Expected output
API implementation and contract, validation and auth, error model, background jobs, observability hooks, tests, handoff to `qa-engineer`, `security-engineer`, `code-reviewer`.
