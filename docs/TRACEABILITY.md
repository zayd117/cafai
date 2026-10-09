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
| A-006, A-007 | Real taxonomy and offerings | DRAFT; human curation remains BLOCKED | `catalog/taxonomy.yaml` (14 capabilities), `catalog/offerings/` (11 tools for 3 saved examples) | Schema/semantic checks pass; no real labeled quality evaluation |
| — | Dev/test data | FIXTURE | `catalog/fixtures/**` (every record `fixture: true`) | "rejects fixture records in the real catalog" |
| §11 | Referential integrity: capability ids, client ids, install method per client | NECESSARY | `load.ts` | two rejection tests |

## L2 Data layer

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §17 | Managed Postgres (local Postgres 16 for dev/test) | CONFIRMED | `scripts/db-bootstrap.sh`, `scripts/migrate.ts`, `db/migrations/001_core.sql` | migrate applies once, then "up to date" |
| §14, §19 | org_id on tenant rows; row-level security as a second wall; other tenants' ids behave as missing (404) | CONFIRMED | RLS policies in `001_core.sql`; `src/db/client.ts` `withAccess` (transaction-local settings) | "isolates tenants", "does not let the app role enumerate anonymous runs", child-row tenant checks |
| §8, §18 | Anonymous first run; runs shareable and resumable by URL | CONFIRMED | `src/server/runService.ts` `startRun`, `loadRun` (unguessable UUID is the read capability) | "creates an anonymous run readable by its id" |
| §19 | Recommendation stores offering id, catalog version, score components; catalog facts re-render from the snapshot | CONFIRMED | `recommendations` table, `startRun` | "stores recommendations as ids, bands and components" |
| §2, §11 | Every run stores model, prompt, taxonomy and catalog versions | CONFIRMED | `recommendation_runs.catalog_version`, `pipeline_versions` | schema FK to `catalog_snapshots` |
| §19 | Catalog readable by everyone, writable only by the catalog pipeline | CONFIRMED | grants; `publishSnapshot` via `cafai_catalog` | "keeps the catalog writable only by the catalog pipeline" |
| §19 | Feedback with reason codes | CONFIRMED (reason list OPEN) | `feedback`, `addFeedback` | "records feedback and rejects a recommendation id from another run" |
| §19 | Append-only usage and AI cost ledger | CONFIRMED | `usage_events`, `startRun` (same transaction as the result) | "keeps the usage ledger append-only" |
| §12, A-010 | Anonymous run content deleted after 30 days; raw text trimmed after its window | CONFIRMED (windows are ASSUMPTIONS) | `src/config/retention.ts`, `purge_expired()` via the app-role worker | "purges expired anonymous runs and trims expired raw text" |
| §17, §14 | Kill-switch flag rows | CONFIRMED (read path built in L8) | `flags` table | — |
| §15 | Users, identities, memberships, sessions | DEFERRED to L7 (A-003) | — | — |

## L3 Recommendation engine (stages 1-12)

| Plan § | Requirement | Kind | Files | Test |
|---|---|---|---|---|
| §9 st.1, §12 | Normalize, redact keys/tokens/emails/phones, cap length before storing or any model call | CONFIRMED (cap number PLACEHOLDER) | `src/engine/redact.ts` | `redact.test.ts` (9 canaries), "never sends secrets to any model" |
| Audit F-02 | Apply the same redaction to edited read-back text, labels, quotes and suggestions | CONFIRMED | `actions.ts`, `pipeline.ts`, `tags.ts`, `understand.ts` | Pipeline and DB persistence canaries; Chromium crafted-form rerun |
| §9 st.2-3 | One schema-bound call: profile items with quoted evidence; concepts mapped to taxonomy ids; unmatched terms logged as gaps | CONFIRMED | `understand.ts`, `schemas.ts` | "drops read-back items whose quote is not…", "logs unmatched expansion terms" |
| §9 st.4 | Need types present/stated/implied/latent/not relevant; rules first, model fills gaps; latent only from curated signals, max one | CONFIRMED | `understand.ts` | "accepts latent needs only through curated signals" |
| Audit F-01 | Directly rejected job phrases do not become stated needs; questions and uncertainty remain with the model | CONFIRMED for the documented English patterns | `understand.ts`, `understand.test.ts`, `fx-c-negated-payments.json` | Positive/rejected pairs for all 20 fixture/real capability families; mixed clauses and incorrect model need |
| §9 st.5-7 | Catalog-only discovery; filter by declared clients, constraints, trust eligibility, staleness; INFERRED-only cannot justify a pick | CONFIRMED | `match.ts` `discoverAndFilter` | "filters by declared clients", "removes offerings unverified…", "never recommends flagged" |
| §9 st.8 | Two-way match: one call over ≤12 candidates; closed world; quotes must be the user's words; forward and backward | CONFIRMED | `match.ts` `judge` | "ignores invented candidate ids" |
| §9 st.9-10 | Match and Confidence separate, bands; evidence check | CONFIRMED (weights/cut-points PLACEHOLDER, A-009) | `match.ts` `score`, `evidenceCheck`, `config.ts` | "keeps Match and Confidence separate" |
| §9 st.11, §6, §8 | Order by Match; one per capability; cap 5; ≤1 Also worth knowing (Good+, Medium+); Low confidence and Checked never top 3; Possible/Weak/Skip under Not needed now | CONFIRMED (A-013, A-021 interpretations) | `assemble.ts` | "direct picks first and one AWK…", "keeps Checked-trust picks out of the top three" |
| §9 st.12, §8, §29 | Explanation cites evidence ids; rejects URLs, commands, prices, safety claims, level-1 jargon; length limit; template fallback | CONFIRMED (length PLACEHOLDER) | `explain.ts` | "rejects explanations with URLs…" |
| §9 failure table | Low confidence → read-back first; out of scope; nothing needed; no good pick; invalid output → retry once then deterministic; injection flagged, no ranking effect | CONFIRMED | `pipeline.ts` | five outcome tests + "falls back to deterministic rules", "flags injection-like input" |
| §2, §11 | Every run records catalog, config, prompt and model versions | CONFIRMED | `pipeline.ts` `versions` | "records versions for replay" |
| §17 | LLM and Decision interfaces (Jev can take Decision only after a bake-off win) | CONFIRMED (Jev provider UNVERIFIED LIVE, A-040) | `providers/types.ts`, `providers/jev.ts` | `jev.test.ts` (stub fetch); `npm run jev:smoke` (live, needs key) |
| §9, §17, A-017 | Real model provider: schema-bound calls, fenced data-only inputs, refusal/cut-off treated as invalid | CONFIRMED; UNVERIFIED LIVE (no credential) | `providers/anthropic.ts`, `prompts.ts`, `providers/index.ts` | `anthropic.test.ts` (stub client) |
| §25 | Ablation switches: no expansion (H2), forward-only (H3), evidence gates off (H4) | CONFIRMED | `pipeline.ts` `Ablations` | exercised in L4 harness |

## L4 Evaluation harness

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §9 Evaluation | Labeled cases with must-recommend, acceptable, must-not-recommend, potentially missed, probably-not-needed; eight input types | CONFIRMED | `src/eval/types.ts`, `eval/cases/fixture/*.json` (FIXTURE) | `npm run eval` |
| §9 metrics | Recall at 5, precision at 3, novelty, evidence faithfulness, expansion coverage, not-needed accuracy, Match/Confidence calibration by band, cost per run, p95 latency; harmful picks and invalid ids must be 0 | CONFIRMED | `src/eval/metrics.ts` | `metrics.test.ts` |
| §9 release gate | Any change reruns the suite; regressions block release | CONFIRMED | `gate()`, `eval/baseline.fixture.json`, CI step `npm run eval` | "fails the gate when a metric regresses" |
| §25 ablations | No expansion (H2), forward-only (H3), evidence gates off (H4) | CONFIRMED | `scripts/eval.ts` arms | eval output table |
| §25 H5 technical-wording card | Comprehension test with people | NOT BUILT (needs the UI and human testers) | — | — |
| §9, §25 baseline | Blind pairs vs a general assistant, neutral format, random order, separate key; win rate | CONFIRMED | `src/eval/blind.ts`, `--export-pairs`, `--score-pairs` | "builds blind pairs…" |
| §9 | Adversarial inputs (injection) in the suite | CONFIRMED (FIXTURE) | `fx-c-injection.json` | harmful_picks 0 |
| A-008 | Real labeled set (60–100 cases) and assistant answers | BLOCKED on concierge data | `eval/cases/real/README.md` | — |

## L5–L6 App shell and core UX (built from wireframe canvas Ws1hft8GALEGne1L616Y4Y)

| Plan § | Requirement | Kind | Files | Browser check (`scripts/flow.mjs`) |
|---|---|---|---|---|
| §18 | Strict CSP, dynamic nonce; no inline styles; hostnames on external links | CONFIRMED | `src/proxy.ts`, `globals.css` | "strict CSP header"; copy button hydrates under CSP |
| §8, §18 route `/` | Counter: one input, AI-tool chips, example prompts from §6/§7, "Don't paste secrets", no signup | CONFIRMED | `src/app/page.tsx`, `actions.ts#submitOrder` | counter heading, empty input error |
| §8, §24 | State A "something specific" as optional extra signal | CONFIRMED | `submitOrder` (sent as a user item of kind interest) | — |
| §8 | Project-type chips | NOT BUILT: values unspecified (REGISTER A-028) | — | — |
| §6, §9, §18 route `/r/:runId` | Read-back as editable items; edits rerun (new run, parent linked); at most one question; confirm on low confidence | CONFIRMED | `r/[runId]/page.tsx`, `actions.ts#rerun` | — (manual check pending, TEST_CASES T-07) |
| §8 card anatomy | 12 parts on 3 levels; no jargon at level 1; Match bar + Confidence dots; "Do you need it?"; evidence tags with dates; score numbers only at level 3 | CONFIRMED, CHANGED 2026-10-07 by the user (A-042): need and confidence shown as one pill at level 1; Match and Confidence indicators with words under "More details"; ADDED 2026-10-08 (A-043): a "Found on" link with a dated picture | `_components/PickCard.tsx`, `FoundOn.tsx`, `cardCopy.ts`, `labels.ts` | 1–5 cards, no jargon at level 1, pill + facts + "It can see" on every card, Match and Confidence under More details, level 3 shows type |
| §8, §9 | Directly relevant picks, then at most one "Also worth knowing"; "Not needed now" collapsed with reasons; "How we chose these" | CONFIRMED | `r/[runId]/page.tsx` | at most one AWK |
| §6, §9 | Outcomes: nothing needed, no good pick yet, needs confirmation, needs clarification, out of scope | CONFIRMED (copy for out-of-scope and banner is placeholder, A-030) | `r/[runId]/page.tsx` | nothing-needed, out-of-scope |
| §8, §9 Feedback | Per card: useful / not useful / already knew; setup: It worked / I'm stuck | CONFIRMED (reason codes open) | `actions.ts#sendFeedback` | feedback acknowledged ×2 |
| §8 Advanced controls | Filters: remote only, vendor-official only, free only | CONFIRMED | order sidebar → `rerun` | — |
| §19 | Old runs re-render from their own catalog snapshot | CONFIRMED | `runtime.ts#snapshotFor` | — |
| §13, §14 route setup | Handoff per declared client; full commands; danger highlighting; Cursor config decoded before link; hostnames; headless warning; first prompt; no keys held | CONFIRMED | `src/setup/handoff.ts`, `r/[runId]/setup/page.tsx` | setup heading, decoded Cursor config, least-privilege warning |
| §18 | Mobile: setup says it works best on a computer | CONFIRMED | `.setup-desktop-note` | mobile screenshots |
| §18 | "Send these steps to myself" | NOT BUILT: channel unspecified (wireframe UNKNOWN) | — | — |
| §18 | Streaming read-back then cards | NOT BUILT YET: page renders when the run completes | — | — |

## L8 Abuse, cost and operational controls

| Plan § | Requirement | Kind | Files | Verification |
|---|---|---|---|---|
| §14 risk 5, §24 | Per-client quotas; 429-style refusal with retry window | CONFIRMED (cap PLACEHOLDER, A-032) | `003_controls.sql` `quota_hit`, `server/controls.ts`, `actions.ts#guarded` | `controls.db.test.ts`; controls-flow "quota exceeded" |
| §12 | No raw client address stored (salted hash) | CONFIRMED | `clientKey` | "hashes client addresses" |
| §14, §24 | Global daily AI budget with circuit breaker | CONFIRMED (cap PLACEHOLDER; interim behaviour A-033) | `spend_today_micros()`, `budgetSpent`, `costMicros` per call | "trips the budget breaker" |
| §14, §17 | Kill switches read on each request: AI off, runs off, revoke one tool | CONFIRMED | `flags`, `readFlags`, `DisabledProvider` | controls-flow: revoked, ai_off, runs_off |
| §11, §19 | Revoked offering: never recommended, old runs annotated, setup hidden | CONFIRMED (notice copy placeholder, A-030) | `PickCard` revoked, setup filter, `run()` snapshot filter | controls-flow ×2 |
| §14, §15 | Append-only audit of admin actions (flag changes) | CONFIRMED | `audit_events`, `flags_audit` trigger | "audits every flag change"; controls-flow |
| §12, §17 | Retention purge job (anonymous runs, raw text, quota windows) | CONFIRMED | `purge_expired()`, `scripts/worker.ts` | "lets the app role run the purge" |
| §14 | No error details leak to users | CONFIRMED | `src/app/error.tsx` | — |
| §17 | Redacted structured logs (no description text) | CONFIRMED | `runService.ts` `run_completed` log | — |
| §24 | Bot check on anonymous runs | PARTIAL: honeypot field only; vendor open (A-005) | `page.tsx` `.hp` | controls-flow "honeypot" |
| §24 | Day 3–7 follow-up email | BLOCKED: email provider (A-005) and where the address is asked (A-012) | — | — |

## L9 Should-haves

| Plan § | Requirement | Kind | Files | Verification |
|---|---|---|---|---|
| §24, §8 | "Show alternatives": other eligible offerings for the same capability | CONFIRMED (two-pick comparison not built) | `assemble.ts`, `004_alternatives.sql`, `PickCard` | pipeline test; flow "alternatives listed" |
| §9, §24 | "How we understood this": concepts behind the read-back, unmapped ones shown as gaps | CONFIRMED | `r/[runId]/page.tsx` | flow "unmapped concept shown as a gap" |
| §24 | Pasting a manifest | NOT BUILT: no mapping from dependency names to capabilities in the plan or catalog schema (A-036) | — | — |
| §24 | Glossary tooltips | NOT BUILT: wording unspecified (A-029) | — | — |
| §24 | Priced Pro waitlist | NOT BUILT: price is a range to test and needs an email provider (A-005) | — | — |
| §24 | Automated weekly catalog checks | NOT BUILT: a small draft exists; scheduled source rechecks and human curation remain open (A-006) | — | — |
| §13, §24 | Anonymous read-only `recommend` MCP tool | BLOCKED (A-037): SDK lacks spec 2026-07-28 | — | — |

## L10 QA and production readiness

| Plan § | Requirement | Kind | Files | Verification |
|---|---|---|---|---|
| §18 | WCAG 2.2 AA; keyboard use; visible focus; labelled controls | CONFIRMED | `scripts/a11y.mjs` | axe: 0 violations on counter, results (all levels open), setup, legal page; keyboard and focus-ring checks |
| §14 | Our own supply chain: lockfile, dependency review | CONFIRMED (SBOM not generated yet) | `package-lock.json` | `npm audit --omit=dev`: 0 vulnerabilities |
| §14 self-audit, §24 | Disclaimers for AI output and third-party tools; the UI says plainly Caf.ai cannot prevent harm after install | CONFIRMED | `layout.tsx` footer | screenshot 05 |
| §24 | Terms, privacy, takedown and security contacts | BLOCKED on counsel (A-038) | `terms`, `privacy`, `security` placeholder pages | axe |
| §17 | Deploy to a managed host | LIVE 2026-10-06 at https://cafai-xi.vercel.app (A-039) | `docs/DEPLOY.md`, `scripts/deploy-db.ts`, `scripts/deploy-vercel.ts`, `.github/workflows/setup-production.yml`, `deploy-database.yml`, `retention-purge.yml` | `deploy-db.test.ts`, `deploy-vercel.test.ts`; setup, rerun, migrate and purge run against a Postgres 16 cluster with a Neon-like non-superuser admin, then `npm run flow` on the result; T-18 ran the same flow against the live site |

## Phase 0 bake-off harness

| Plan § | Requirement | Kind | Files | Verification |
|---|---|---|---|---|
| §25 | Arms on the same cases: A1 LLM only, A2 LLM + Jev on structured decisions, four ablations; A0 general-assistant baseline via blind pairs (GPT/ChatGPT baseline only, A-041) | CONFIRMED (A2 runs when a TypeSafe key is set; NOT RUN otherwise, A-040) | `src/eval/bakeoff.ts`, `scripts/eval.ts --arms --repeats` | `bakeoff.test.ts`; `npm run eval -- --arms ... --repeats 3` |
| §25 | Jev judged on false positives, calibration, consistency; win = margin on ≥2, no rise in harmful picks, cost inside cap | CONFIRMED (margin 0.10 and cap $0.05 are ASSUMPTIONS) | `evaluateCheck` jev_win, `eval/bakeoff.json` | "Jev wins only on enough measures…" |
| §25 | Pass lines written before the run for H2, H3, H4 | CONFIRMED (starting proposals, ASSUMPTION) | `eval/bakeoff.json` | eval output "pass lines" |
