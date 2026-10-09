# Verification record

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`. Local production build and typecheck pass. Real and fixture catalog checks, case validation and the four-case fixture/mock evaluation release gate pass.

Local `npm test`: 19 files and 140 tests passed; two DB suites could not initialize native PostgreSQL, leaving 13 tests skipped. This is not a full local suite pass. The environment cannot run the standard native DB setup. A disposable PGlite preview was prepared for UI work only; it is not security or production-PostgreSQL evidence. Local Chromium also encountered an environment rendering failure, so a local browser pass is not claimed.

The draft PR's GitHub Actions CI supplies the authoritative native PostgreSQL and browser verification for the final commit. This file will be updated with the exact run, counts, outcomes and screenshot artifact before the user reviews the change. CI screenshots are fixture/mock and saved-example journeys, not fresh production captures or live-model quality evidence.

New `scripts/design-flow.mjs` checks widths 320, 390, 760 and 1440; visible composer and touch target; initial/live reduced motion; entrance cleanup; focus preservation; pending-button disabling; browser errors; and native no-JavaScript project and saved-example submission. Existing browser and accessibility scripts remain intact.

No merge or production deployment is authorized by these checks. User approval or requested changes must come after reviewing screenshots.
