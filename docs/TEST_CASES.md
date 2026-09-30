# Test cases

How to run everything, what is automated, and what still needs a person. Updated at every build chunk.

## Run

```
npm run db:bootstrap                 # local Postgres roles and databases (dev/test only)
DATABASE_OWNER_URL=... npm run db:migrate
DATABASE_CATALOG_URL=... npx tsx scripts/publish-catalog.ts --fixtures
npm run typecheck && npm run catalog:check && npm test && npm run eval
CAFAI_CATALOG=fixture DATABASE_URL=... npm run build && npx next start -p 3100
npm run flow -- http://localhost:3100 docs/figma-handoff/screens
```

## Automated

| Suite | Count | Covers |
|---|---|---|
| `src/catalog/load.test.ts` | 8 | Schema validation, fixture separation, referential rules, trust rule, stable snapshot version |
| `src/db/runs.db.test.ts` | 9 | Row-level security: tenant isolation, no enumeration of anonymous runs, child rows cannot claim another tenant, catalog write lock, append-only ledger, retention purge |
| `src/engine/redact.test.ts` | 14 | 9 canary secrets, key assignments, URL credentials, private keys, length cap, injection flag |
| `src/engine/pipeline.test.ts` | 17 | Lanes and caps, flagged never shown, closed world, evidence checks, latent-signal rule, explanation validator and fallback, outcomes, deterministic fallback, Checked held back, client filter, staleness, secret canary, injection has no ranking effect |
| `src/engine/providers/anthropic.test.ts` | 5 | Request shape (fenced data, schema, fallback), refusal/cut-off handling, served-model recording (stub client, not live) |
| `src/eval/metrics.test.ts` | 5 | Metrics, release gate, pricing, blind pairs |
| `src/server/controls.db.test.ts` | 4 | Quota hashing and cap, budget breaker, app-role purge, flag audit and grants |
| `src/setup/handoff.test.ts` | 6 | Danger detection, Cursor link decoding (incl. "+"), hostnames, route choice, paste message |
| `npm run eval` | 4 fixture cases × 4 arms | Release gate: harmful picks 0, invalid ids 0, no regression vs baseline |
| `npm run flow` (Chromium) | 47 checks | See below |
| `scripts/a11y.mjs` (Chromium + axe) | 6 checks | WCAG 2.2 AA scans (counter, results with every level open, setup, legal page), keyboard reach, visible focus ring |
| `scripts/controls-flow.mjs` (Chromium + DB) | 9 checks | Revoked pick annotated and setup hidden, AI off → degraded banner and read-back first, runs off → paused, quota cap, honeypot, flag audit |

### Browser checks (`scripts/flow.mjs`, desktop 1440 and mobile 390)

Counter heading · sample-mode banner · strict CSP header · no horizontal scroll (counter, results) · empty-input error ·
1–5 pick cards · at most one "Also worth knowing" · no jargon at card level 1 · Match and Confidence words · level 3
opens · card feedback round-trip · setup page · only ticked picks in setup · paste message · least-privilege warning ·
copy button works (client JS under CSP) · Cursor config decoded before link · setup feedback round-trip ·
404 for unknown run · nothing-needed outcome · out-of-scope outcome · zero console errors, failed requests or HTTP errors.

## Manual (not automated yet)

| ID | Case | Steps | Expected | Status |
|---|---|---|---|---|
| T-07 | Read-back edit reruns | On a results page open "Change this", edit an item, add one, press "Update my picks" | New run URL; picks recomputed; old run unchanged | Automated in flow.mjs |
| T-08 | Refine filters | Tick "Free only", "Update picks" | Paid offerings leave the picks; filter stays ticked | Automated in flow.mjs (filter persists; fixture catalog has no paid pick to drop) |
| T-09 | Low-confidence confirm | Input that the model reads with low confidence | Read-back open, "Is this right?", no picks until "Yes, that's right" | Shown in controls-flow (AI off); pressing "Yes, that's right" not yet automated |
| T-10 | Clarifying question | Input with a model question | One question with options; answer reruns | Needs a fixture script with a question |
| T-11 | Degraded banner | Explanation model fails | Banner shown; cards use template wording | Covered in unit tests; not in browser |
| T-12 | Keyboard only | Tab through counter → results → setup | Every control reachable, visible focus ring, details toggle with Enter/Space | Partly automated in a11y.mjs (counter tab order, keyboard submit); full traversal of results not yet |
| T-13 | Screen reader labels | Check chips, meters, cards with a screen reader | Chips announce state; meters announced by their words; cards labelled by title | Not run |
| T-14 | Real model | Set `CAFAI_MODEL_PROVIDER=anthropic` with a key | Same flow with live understanding and explanations | BLOCKED: no API key (REGISTER A-017) |
| T-15 | Blind comparison | 60–100 real cases with assistant answers | Win rate from judges | BLOCKED: needs concierge data (A-008) |
