# Requirement traceability

Format: MD section → requirement → engineering task → files → test. Kind: **CONFIRMED** (explicit in plan), **NECESSARY** (needed to implement confirmed behavior, no product change), **PLACEHOLDER**.

## L0 Foundation

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §17 | One TypeScript full-stack deployable (Next.js), Postgres, no extra services | CONFIRMED (stack approved A-004) | `package.json`, `tsconfig.json`, `next.config.ts` | `npm run typecheck`, `npm run build` |
| §17 Observability | Uptime check target | CONFIRMED | `src/app/api/health/route.ts` | `route.test.ts`; curl; Chromium |
| §18 | Server-rendered app, route `/` is the counter | CONFIRMED (route only; counter built in L5–L6) | `src/app/page.tsx` (PLACEHOLDER) | Chromium screenshot |
| §14 Secrets | Nothing in repo/client bundle; server-side only | CONFIRMED | `.gitignore`, `.env.example` | review |
| §14 Build pipeline | Lockfile committed | CONFIRMED | `package-lock.json` | review |
| §13 Sessions/cookies, §18 CSP | Security headers, strict CSP | CONFIRMED, **not yet built** | — | scheduled: L5 (shell) |
| §29 | Verify in real browser | process | `scripts/shot.mjs` | prints status, console errors, failed requests |

## L1 Catalog-as-code

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §11, §17 | Catalog is YAML in Git, checked against JSON Schema in CI | CONFIRMED | `catalog/schema/*.json`, `scripts/check-catalog.ts`, `.github/workflows/ci.yml` | `npm run catalog:check` |
| §11 field groups | Identity, capability mapping, resource profile, distributions, auth/access, runtime, cost, trust, compatibility evidence, provenance, editorial | CONFIRMED | `offering.schema.json`, `src/catalog/types.ts` | schema tests |
| §9, §19 | Every profile fact tagged claimed / observed / inferred, with source and date | CONFIRMED | `offering.schema.json#/$defs/fact` | "rejects facts without an evidence tag" |
| §10, §24 | MVP kinds: mcp_server, skill, plugin, api, library, play | CONFIRMED | `offering.schema.json` `kind` | "unknown offering kinds" |
| §11 trust states | reviewed / checked / unmatched / flagged / revoked; Reviewed needs vendor-official or namespace-verified | CONFIRMED | schema + `load.ts` rule | "rejects Reviewed trust without…" |
| §11 compatibility | Tested / Reported / Derived / Declared per client, dated | CONFIRMED | `distributions[].compatibility` | schema |
| §9 taxonomy | Capability: job phrases, need signals, skip conditions, native-client coverage | CONFIRMED | `taxonomy.schema.json` | schema |
| §13, A-002 | Three first clients with handoff mechanics | CONFIRMED | `catalog/clients.yaml` | "loads the real catalog" |
| §11 | Every run stores the catalog snapshot version | CONFIRMED (version produced here; stored from L2/L3) | `load.ts` `snapshotVersion` | "stable content-addressed version" |
| A-006, A-007 | Real taxonomy and offerings | BLOCKED | `catalog/taxonomy.yaml` (empty), `catalog/offerings/` (empty) | check prints BLOCKED note |
| — | Dev/test data | FIXTURE | `catalog/fixtures/**` (every record `fixture: true`) | "rejects fixture records in the real catalog" |
| §11 | Referential integrity: capability ids, client ids, install method per client | NECESSARY | `load.ts` | two rejection tests |

## L2 Data layer

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §17 | Managed Postgres (local Postgres 16 for dev/test) | CONFIRMED | `scripts/db-bootstrap.sh`, `scripts/migrate.ts`, `db/migrations/001_core.sql` | migrate applies once, then "up to date" |
| §14, §19 | org_id on tenant rows; row-level security as a second wall; other tenants' ids behave as missing (404) | CONFIRMED | RLS policies in `001_core.sql`; `src/db/client.ts` `withAccess` (transaction-local settings) | "isolates tenants", "does not let the app role enumerate anonymous runs", child-row tenant checks |
| §8, §18 | Anonymous first run; runs shareable and resumable by URL | CONFIRMED | `createAnonymousRun`, `getRun` (unguessable UUID is the read capability) | "creates an anonymous run readable by its id" |
| §19 | Recommendation stores offering id, catalog version, score components; not rendered text | CONFIRMED | `recommendations` table, `saveRecommendations` | "stores recommendations as ids, bands and components" |
| §2, §11 | Every run stores model, prompt, taxonomy and catalog versions | CONFIRMED | `recommendation_runs.catalog_version`, `pipeline_versions` | schema FK to `catalog_snapshots` |
| §19 | Catalog readable by everyone, writable only by the catalog pipeline | CONFIRMED | grants; `publishSnapshot` via `cafai_catalog` | "keeps the catalog writable only by the catalog pipeline" |
| §19 | Feedback with reason codes | CONFIRMED (reason list OPEN) | `feedback`, `addFeedback` | "records feedback and rejects a recommendation id from another run" |
| §19 | Append-only usage and AI cost ledger | CONFIRMED | `usage_events`, `recordUsage` | "keeps the usage ledger append-only" |
| §12, A-010 | Anonymous run content deleted after 30 days; raw text trimmed after its window | CONFIRMED (windows are ASSUMPTIONS) | `src/config/retention.ts`, `purgeExpired` | "purges expired anonymous runs" |
| §17, §14 | Kill-switch flag rows | CONFIRMED (read path built in L8) | `flags` table | — |
| §15 | Users, identities, memberships, sessions | DEFERRED to L7 (A-003) | — | — |
