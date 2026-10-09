# Verification record

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`. Local production build and typecheck pass. Real and fixture catalog checks, case validation and the four-case fixture/mock evaluation release gate pass.

Local `npm test`: 19 files and 140 tests passed; two DB suites could not initialize native PostgreSQL, leaving 13 tests skipped. This is not a full local suite pass. The environment cannot run the standard native DB setup. A disposable PGlite preview was prepared for UI work only; it is not security or production-PostgreSQL evidence. The initial single-process Chromium launch encountered an environment rendering failure. A multi-process Chromium launch subsequently succeeded; fresh local browser evidence is recorded below.

The first CI run ([37918932212](https://github.com/zayd117/cafai/actions/runs/37918932212)) passed the native PostgreSQL suite, standard browser flow and accessibility checks, then failed the new no-JavaScript click because Playwright's animation-stability polling stalled. The new check now uses native Enter activation for the no-JavaScript form path; pointer interaction and motion remain covered separately. This is a test adjustment, not a claim that the failed run passed.

## Passing native CI

[Run 37919710484](https://github.com/zayd117/cafai/actions/runs/37919710484), application/test commit `78f38076c7a68961b8cfc75e55dcdbdeb7f84122`, passed every step:

- Native PostgreSQL 16.15: **21 test files, 153 tests passed**, including the database role and row-level security suites.
- Typecheck, real/fixture catalog validation, cases validation and production build passed.
- Fixture/mock evaluation release gate passed against the baseline. H3/H4 ablation criteria still lack useful evidence in this small fixture set; this is not a live recommendation-quality pass.
- **116 existing browser-flow checks** passed on desktop and mobile, with no console, request or HTTP errors (four background fetches were cancelled by navigation).
- **8 accessibility checks** passed; all five axe scans reported zero violations, and keyboard/focus/source-preview checks passed.
- **24 new design behavior checks** passed, including native Enter activation of project and saved-example forms with JavaScript disabled.

[24-image screenshot artifact](https://github.com/zayd117/cafai/actions/runs/37919710484/artifacts/11610419249), ZIP SHA-256 `9f769300b9260c6a58c7fa7ca375ffa635c1ae51c9e9d6e4d668f12dd2027c08`. Desktop/phone intake, results, setup, source previews and saved examples were visually reviewed; 320px, 390px, 760px and 1440px captures are included. Final follow-up changes only record this evidence; they do not modify application or test source. CI screenshots are fixture/mock and saved-example journeys, not fresh production captures or live-model quality evidence.

New `scripts/design-flow.mjs` checks widths 320, 390, 760 and 1440; visible composer and touch target; initial/live reduced motion; entrance cleanup; focus preservation; pending-button disabling; browser errors; and native no-JavaScript project and saved-example submission. Existing browser and accessibility scripts remain intact.

No merge or production deployment is authorized by these checks. User approval or requested changes must come after reviewing screenshots.

## Own Chromium before/after comparison

At the user's explicit request, Chromium **153.0.8010.0** was launched locally through Playwright, using the audit baseline checkout `33cacaafa9648bd11bc1acbcf33763c4b7778fcd` and redesigned checkout `f085a21dfc10a4b4532282d888d58fb11f696dc9`. Both used production builds, the same local app URL, fixture/mock configuration, catalog snapshots, scripted inputs, desktop viewport **1440×1000** and phone viewport **390×844**. Fresh full-page captures were taken for both versions; archived or CI images were not substituted for the requested comparison.

- Before: **116 browser checks and 8 accessibility checks passed** locally.
- After: **116 browser checks, 8 accessibility checks and 24 design checks passed** locally.
- All local axe scans returned zero violations. Both flows reported no console, failed-request or HTTP errors; background fetches cancelled by deliberate navigation are recorded separately.
- Desktop and phone intake, results, expanded cards, setup, source preview and saved-example captures are included. Comparison sheets label each version and any cropped top section; the originals remain uncropped.

The local visual fixture database was disposable PGlite, so these runs provide browser/UI evidence, not native database-role or RLS evidence. Native PostgreSQL security verification is supplied by CI. [Current application-head CI run 37920062864](https://github.com/zayd117/cafai/actions/runs/37920062864) also passed every step on `f085a21dfc10a4b4532282d888d58fb11f696dc9`. Later documentation updates do not alter application or test code.
