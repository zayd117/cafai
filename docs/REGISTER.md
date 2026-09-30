# Assumption / Unknown Register

Source of truth: Caf.ai Master Plan v3.1 (Claude Docs `d31d9fc8-62f8-41a3-ba3b-f8498017b70b`; summary in the session upload). Section numbers below are the plan's.
Status: **RESOLVED** (user-confirmed), **DEFERRED** (decision postponed to a named chunk), **OPEN**, **BLOCKED** (cannot proceed on that item without an answer).

| ID | Question | Plan source | Status |
|---|---|---|---|
| A-001 | Plan gates MVP code behind Phase 0 evidence (G0). Build now? | §25, §29 | RESOLVED: gate-compatible work first (L0–L4 + UI on labeled mock data). Real catalog content and labeled set wait for user data. |
| A-002 | Which three clients first? | §27 (ASSUMPTION) | RESOLVED: Claude Code, Cursor, Claude Desktop. |
| A-003 | Identity provider for magic link + GitHub sign-in | §13 (unnamed) | DEFERRED to L7. Core loop needs no account (§8, §24). |
| A-004 | Stack | §17 ("such as Next.js", "managed Postgres") | RESOLVED: Next.js + TypeScript + Postgres. Hosting, email, bot-check and other vendors remain undecided. |
| A-005 | Email provider, bot-check provider | §14, §17 (unnamed) | OPEN, needed at L8. |
| A-006 | Catalog content (~100 offerings, curator-approved profiles) | §24 | BLOCKED on curation. Dev uses entries labeled `FIXTURE`, never shown as real. |
| A-007 | Taxonomy v1 (40–60 capabilities) | §29 "from concierge needs, not from any catalog" | BLOCKED on concierge data. Dev uses a tiny `FIXTURE` taxonomy. |
| A-008 | Labeled evaluation set (60–100 cases, eight input types) | §25 | BLOCKED on real concierge projects. Harness is built; data is not invented. |
| A-009 | Numeric Match/Confidence weights and band cut-points | §9 (all ASSUMPTION; none given) | OPEN. Placeholders live in versioned config and are labeled `PLACEHOLDER`. |
| A-010 | Anonymous run text: 30 days or delete after session | §12 (30 days ASSUMPTION), §27 (open) | OPEN, decide before launch. Config default 30 days, labeled ASSUMPTION. |
| A-011 | Admin app screens in MVP | §18 "MVP, minimal" | OPEN, needed at L8. |
| A-012 | Where the follow-up email address is captured | §24 | OPEN, needed at L8. |
| A-013 | Does the five-pick cap include the "Also worth knowing" pick? | §6, §8, §9 | Assumed yes (§8 "3–5 cards" including it). Confirm if wrong. |
| A-014 | Saved-project re-run in MVP vs Phase 2 | §18 vs §25 | Assumed: manual re-run only in MVP; re-run on change is Phase 2. |
| A-015 | TypeScript version | not in plan | Engineering decision: pinned 5.9.x. The 7.x native compiler is unverified against Next 16's build-time type check. |
| A-016 | Brand icon / favicon | not in plan or wireframes | Placeholder (empty data URI) to avoid a `/favicon.ico` 404. |
| A-017 | Real model calls | §9, §17 | `ANTHROPIC_API_KEY` is not set in this environment. Engine runs against a `MOCK` provider until it is provided; mock results are never presented as real. |
| A-018 | Postgres for dev/test | §17 | Server binaries exist (`/usr/lib/postgresql/16`); Docker daemon is down. Decide start method at L2. |
| A-019 | Structure of a "need signal" | §9, §11 name it but give no shape | Stored as `{text, need_type: implied\|latent}` until the engine design needs more; change is a schema migration of YAML only. |
| A-021 | A low-confidence or Checked-trust pick when fewer than three other picks exist | §9 "never in the top three" | Interpreted literally: it is not shown as a pick and appears under Not needed now as "held back" with the plan's wording ("looks relevant, but not enough evidence to be confident"). Confirm. |
| A-022 | Five-pick cap when an "Also worth knowing" pick exists | §6, §8, §9 | Direct picks capped at 4 so the one AWK pick fits (follows A-013). |
| A-023 | "Do you need it?" mapping | §8 part 6 names three answers, no mapping | stated/implied → needed now; latent → useful later; everything under Not needed now → probably not. |
| A-024 | Match dimension formulas | §9 table gives one-line rules only | Literal minimal forms in `src/engine/match.ts`; backward direction folded into Capability match ("the core of the two-way match"). All PLACEHOLDER (A-009). |
| A-020 | GitHub push access | environment | `git push` to `zayd117/cafai` returns 403 (Claude GitHub App not installed / not linked). Commits are local until fixed. |

Wireframe canvas unknowns (21 items, exact answers needed) are listed on the canvas sticky note: https://claude.ai/artifact/Ws1hft8GALEGne1L616Y4Y

Source-document defects: several ASCII diagrams in the plan are truncated in the source itself (§6 map, §8 card layout, §9 stages 9–10 labels, §10 relationships, §19 data model). Tables and prose were used instead.
