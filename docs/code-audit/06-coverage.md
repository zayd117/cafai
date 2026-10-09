# Review coverage

Reviewed the complete current production TS/TSX/CSS module set, operational scripts, migrations, workflows, schemas and runtime configuration. The table records decisions against the original audit baseline, including the earlier visual draft. “Keep” means reviewed without a justified implementation change; it is not a certification that no defect can exist.

Existing tests were executed and the changed/nearest regression suites were inspected. This does not claim a new manual line-by-line review of every pre-existing test, third-party package, catalog fact, image, legal statement or external account.

## Production modules (78)

| Module | Decision | Ownership / reason |
| --- | --- | --- |
| `src/app/_components/CopyButton.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/FoundOn.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/LegalPlaceholder.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/ModeBanner.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/OrderSummary.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/PickCard.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/ProjectInput.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/ReadBackTags.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/SavedExampleNote.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/SubmitButton.tsx` | Keep | Shared pending label and disabled submit. |
| `src/app/_components/Thanks.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/cardCopy.ts` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/format.ts` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/icons.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/_components/labels.ts` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/actions.ts` | Changed | Redact form fields before truncation. |
| `src/app/api/health/route.ts` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/error.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/globals.css` | Changed | Style ownership imports; not counted as deletion. |
| `src/app/layout.tsx` | Changed | Existing shell and font ownership; prior typography refresh. |
| `src/app/not-found.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/page.tsx` | Changed | One shared responsive intake; remove unused signoff. |
| `src/app/privacy/page.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/r/[runId]/not-found.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/r/[runId]/page.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/r/[runId]/setup/page.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/security/page.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/styles/base.css` | Changed | Style ownership split; preserved UI/CSP/native interaction contracts. |
| `src/app/styles/intake.css` | Changed | Original desktop composition; preferred mobile style. |
| `src/app/styles/responsive.css` | Changed | Style ownership split; preserved UI/CSP/native interaction contracts. |
| `src/app/styles/results.css` | Changed | Style ownership split; preserved UI/CSP/native interaction contracts. |
| `src/app/styles/setup.css` | Changed | Style ownership split; preserved UI/CSP/native interaction contracts. |
| `src/app/terms/page.tsx` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/app/tokens.css` | Keep | Keep component/route ownership, forms, focus and feedback contracts. |
| `src/catalog/load.ts` | Changed | Typed schema boundary; early invalid-shape return. |
| `src/catalog/types.ts` | Keep | Keep catalog domain types canonical. |
| `src/config/controls.ts` | Keep | Keep pricing, retention and control constants canonical. |
| `src/config/pricing.ts` | Keep | Keep pricing, retention and control constants canonical. |
| `src/config/retention.ts` | Keep | Keep pricing, retention and control constants canonical. |
| `src/db/client.ts` | Keep | Keep transaction/access boundary; no grant/RLS relaxation. |
| `src/db/runs.ts` | Changed | Delete six obsolete helpers; retain publication and feedback. |
| `src/discover/bakeoff.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/claude.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/claudeScorer.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/rank.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/run.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/scorer.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/search.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/discover/types.ts` | Keep | Keep experimental discovery separate from recommendation engine. |
| `src/engine/assemble.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/config.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/explain.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/match.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/pipeline.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/prompts.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/providers/anthropic.ts` | Keep | Keep transport/schema/usage boundaries and explicit fallbacks. |
| `src/engine/providers/index.ts` | Keep | Keep transport/schema/usage boundaries and explicit fallbacks. |
| `src/engine/providers/jev.ts` | Keep | Keep transport/schema/usage boundaries and explicit fallbacks. |
| `src/engine/providers/mock.ts` | Keep | Keep transport/schema/usage boundaries and explicit fallbacks. |
| `src/engine/providers/types.ts` | Keep | Keep transport/schema/usage boundaries and explicit fallbacks. |
| `src/engine/redact.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/schemas.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/tags.ts` | Changed | Canonical label redaction and normalization. |
| `src/engine/types.ts` | Keep | Keep closed-world evidence, ranking, lane/cap and fallback policy. |
| `src/engine/understand.ts` | Changed | Direct exclusions/uncertainty; redact model item text. |
| `src/eval/bakeoff.ts` | Changed | Use canonical useful-pick predicate. |
| `src/eval/blind.ts` | Keep | Keep explicit evaluation/reporting ownership. |
| `src/eval/metrics.ts` | Changed | Export existing useful-pick predicate. |
| `src/eval/run.ts` | Keep | Keep explicit evaluation/reporting ownership. |
| `src/eval/types.ts` | Keep | Keep explicit evaluation/reporting ownership. |
| `src/lib/ajv.ts` | Keep | Keep small shared validation/word-count utilities. |
| `src/lib/words.ts` | Keep | Keep small shared validation/word-count utilities. |
| `src/proxy.ts` | Keep | Keep nonce/CSP boundary and native route behavior. |
| `src/server/controls.ts` | Keep | Keep controls/runtime/prepared-example boundary. |
| `src/server/runService.ts` | Changed | Canonical persistence; preserve optional tenant access context. |
| `src/server/runtime.ts` | Keep | Keep controls/runtime/prepared-example boundary. |
| `src/server/savedExamples.ts` | Keep | Keep controls/runtime/prepared-example boundary. |
| `src/setup/handoff.ts` | Keep | Keep explicit handoff safety/client routes. |

## Operational scripts (19, excluding two test modules)

Reviewed DB bootstrap/migrate/publish/worker; catalog/case validation; AI checks/Jev smoke; evaluation/discovery runners; DB/Vercel deployment; own-browser flow/controls/accessibility/design/capture scripts. Only design-flow and Vercel smoke required implementation changes in this audit.

- `scripts/a11y.mjs`
- `scripts/ai-check.ts`
- `scripts/capture-found-on.mjs`
- `scripts/check-cases.ts`
- `scripts/check-catalog.ts`
- `scripts/controls-flow.mjs`
- `scripts/db-bootstrap.sh`
- `scripts/deploy-db.ts`
- `scripts/deploy-vercel.ts`
- `scripts/design-flow.mjs`
- `scripts/discover-bakeoff.ts`
- `scripts/discover.ts`
- `scripts/eval.ts`
- `scripts/flow.mjs`
- `scripts/jev-smoke.ts`
- `scripts/migrate.ts`
- `scripts/publish-catalog.ts`
- `scripts/shot.mjs`
- `scripts/worker.ts`

## Migrations, workflows and schemas

All four migrations were reviewed; no schema/grant/RLS migration changed. CI runs native role checks. All five workflows were reviewed for tests, deployment and account boundaries; no deployment was triggered by this review.

- `db/migrations/001_core.sql`
- `db/migrations/002_run_results.sql`
- `db/migrations/003_controls.sql`
- `db/migrations/004_alternatives.sql`
- `.github/workflows/check-ai.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-database.yml`
- `.github/workflows/retention-purge.yml`
- `.github/workflows/setup-production.yml`
- `catalog/schema/clients.schema.json`
- `catalog/schema/offering.schema.json`
- `catalog/schema/taxonomy.schema.json`

Reviewed `.env.example`, `package.json` / lockfile, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, proxy/CSP, catalogue types and evaluation schemas/config. Real and fixture YAML pass automated integrity checks. Human verification of product facts and source capture rights remains separate.

## Supplied audit follow-through

| Audit concern | Current disposition |
| --- | --- |
| Closed-world catalog, evidence, user edits, caps, score/confidence separation | Preserved; existing pipeline/browser suites exercise the contracts. |
| F01 deterministic negation/mention promotion | Direct rejection and uncertainty patterns covered; full language-quality evaluation remains open. |
| F02 redaction across read-back fields | User/model read-back text and labels sanitized at canonical boundaries; persisted/browser canaries added. Existing redaction-pattern limitations remain. |
| Unmet requirements and ranking | Existing soft penalties preserved; hard-blocker product semantics unresolved. |
| Budget enforcement and accounting | Existing best-effort breaker preserved; atomic reservations/per-call failure persistence unresolved. |
| Catalog readiness, live AI/Jev, real evaluation corpus | Schemas/fixtures checked; human facts, keys and 60–100 labelled cases still required. |
| Legal, Safari, screen reader review | Existing disclosure retained; human review remains required. |
