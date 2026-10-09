# Persistence review

## Structural deletion

Production routes/actions already use `server/runService.ts`. A second path in `db/runs.ts` was used only by tests, or had no callers. The worker already calls the SQL `purge_expired()` function. Removing this parallel path was a real deletion, not movement into a new wrapper.

Deleted helpers: `createAnonymousRun`, `getRun`, `updateRun`, `saveRecommendations`, `recordUsage`, `purgeExpired`, plus their obsolete argument/result types. Kept `publishSnapshot` (catalog publication) and `addFeedback` (feedback with recommendation/run validation).

`loadRun` accepts an optional existing `AccessContext`, preserving the tenant checks formerly exercised through `getRun`. Its `StoredRun` includes `org_id`. Current anonymous route calls remain the same.

## Migrated tests preserve security evidence

The DB suites now create runs through the website's real pipeline and persistence transaction with the existing scripted calorie-tracker fixture. They assert actual read-back, outcome, snapshot, four picks, match components and three recorded usage stages. They continue testing:

- Anonymous run enumeration denial and known-ID read access.
- Tenant isolation, including knowing another tenant's run ID.
- Recommendation rows cannot claim an unrelated organization.
- Catalog write grants and append-only usage permissions.
- Feedback cannot reference a recommendation from a different run.
- Invalid UUID rejection before queries.
- Actual app-role `purge_expired()` removes expired runs and trims expired raw text while preserving a surviving run's picks.
- Quota hashing/caps, budget breaker, kill-switch audit and grants.

The invalid-tenant insertion uses unused rank 99, so its expected RLS error is not accidentally a uniqueness error. A new persisted redaction canary covers the actual website path.

The suites have 14 tests (10 run/security tests and 4 controls tests). They run against native PostgreSQL 16 with distinct roles in CI. Local PGlite screenshots do not substitute for that evidence.

## Measurements and remaining work

`db/runs.ts`: 179 → 33 lines, 81.56% fewer; 8,149 → 1,686 bytes, 79.31% fewer. Across all three persistence owners (`db/client`, `db/runs`, `server/runService`): 387 → 243 lines, 37.21% fewer. Run-creation and run-reading implementations each fall from two to one (50% fewer implementations). Six obsolete helper entrypoints fall to zero (100% of that obsolete set removed).

These scoped figures are not whole-repository savings. Production source overall is 1.10% smaller by lines.

No SQL migration, grant relaxation, RLS bypass or removal of retention/security assertions was made. Atomic budget reservations and per-call failure accounting remain open audit work. The existing usage transaction and breaker semantics are preserved rather than silently redesigned.
