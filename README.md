# Caf.ai

A neutral "what am I missing?" advisor: people describe what they are working on in plain words and get 3–5 explained
picks, one "Also worth knowing" idea at most, a "Not needed now" list, and setup handed to their own AI tool.
Built from **Caf.ai Master Plan v3.1**. Status: pre-validation build (plan §25 Phase 0 gate; see `docs/REGISTER.md` A-001).

**Sample mode.** Until curated data exists, the app runs on a labeled FIXTURE catalog and, without an API key, a MOCK
model. The site says so on every page. Nothing in sample mode is a real recommendation.

## Docs

| File | What it holds |
|---|---|
| `docs/REGISTER.md` | Assumptions, unknowns and blockers, each tied to a plan section |
| `docs/TRACEABILITY.md` | Plan section → requirement → files → test, per build layer |
| `docs/TEST_CASES.md` | Every automated suite and the manual cases still open |
| `docs/FIGMA_HANDOFF.md` | Tokens, components, screens and steps to rebuild the UI in Figma |
| `docs/figma-handoff/screens/` | Real Chromium screenshots, desktop and mobile |

## Run locally

Needs Node 22.12+, Postgres 16 and Chromium (for browser checks).

```
npm ci
npm run db:bootstrap                                   # dev/test roles and databases (local only)
export DATABASE_OWNER_URL=postgres://cafai_owner:cafai_dev_only@localhost:5432/cafai_dev
export DATABASE_CATALOG_URL=postgres://cafai_catalog:cafai_dev_only@localhost:5432/cafai_dev
export DATABASE_URL=postgres://cafai_app:cafai_dev_only@localhost:5432/cafai_dev
npm run db:migrate
npx tsx scripts/publish-catalog.ts --fixtures
CAFAI_CATALOG=fixture QUOTA_SALT=dev-only-salt npm run build
CAFAI_CATALOG=fixture QUOTA_SALT=dev-only-salt npx next start -p 3100
npx tsx scripts/worker.ts                              # retention purge, hourly
```

Real model calls: set `ANTHROPIC_API_KEY` (and optionally `CAFAI_MODEL_*`); see `.env.example`.

## Check

```
npm run typecheck && npm run catalog:check && npm test && npm run eval
npm run flow -- http://localhost:3100 docs/figma-handoff/screens     # 47 Chromium checks
npm run a11y -- http://localhost:3100                                # axe WCAG 2.2 AA + keyboard
DATABASE_OWNER_URL=... node scripts/controls-flow.mjs http://localhost:3101   # server with CAFAI_RUNS_PER_HOUR=3
```

## Kill switches (plan §14)

Rows in the `flags` table, read on every request; every change is written to `audit_events`.

```
INSERT INTO flags (key, enabled) VALUES ('ai_off', true);                -- no model calls
INSERT INTO flags (key, enabled) VALUES ('runs_off', true);              -- pause new orders
INSERT INTO flags (key, enabled) VALUES ('revoke:<offering_id>', true);  -- withdraw one tool everywhere
```
