# Code audit and original-layout interactions

This review applies Ponytail's smallest complete solution, selected pstack subtraction/boundary principles, and Thermo Nuclear's structural review to the existing Caf.ai repository. It follows the supplied `CAFAI_REPOSITORY_AUDIT(2).md` and Caf.ai's documented contracts. External workflow guidance does not replace those contracts.

The owner rejected the visual refresh and requested the original BEFORE presentation everywhere. Original global CSS, intake, shell/footer, results and setup styling are restored; a small interaction-only layer adds pressed, selection, disclosure and pending feedback plus optional haptics. The same native forms and layout remain. This is a draft change in [PR #12](https://github.com/zayd117/cafai/pull/12); merging and deployment require the owner's review of the screenshots and explicit approval.

## Findings and disposition

| Finding | Result | Evidence / owner |
| --- | --- | --- |
| Parallel persistence implementation with no production callers | Removed six obsolete helpers and their duplicate types. DB tests now use the website's actual `startRun` / `loadRun` path; purge tests call the worker's SQL function. | [Persistence](02-persistence.md) |
| Audit F02: read-back fields could retain secrets | Redact user form fields before truncation, model item text before downstream use, and tags/suggestions at their canonical cleaner. | [Engine and privacy](01-engine-privacy.md) |
| Audit F01: phrase hits could promote rejected work | Recognize direct English rejection before a job phrase; do not promote uncertainty/questions or overwrite a model's `not_relevant` from a bare mention. This is a bounded improvement, not complete language understanding. | [Engine and privacy](01-engine-privacy.md) |
| Malformed catalog rows crashed after failed validation | Stop before semantic access when the top-level schemas fail. Use typed AJV validators; remove three domain casts and three redundant array fallbacks. | [Boundaries and operations](04-boundaries-operations.md) |
| Duplicate useful-pick classification in evaluation | Reuse the existing metrics predicate in bake-off; two implementations become one. | [Boundaries and operations](04-boundaries-operations.md) |
| Deployment smoke rejected valid split headline markup | Check the heading's text content, retaining exact headline and status/unknown-run assertions. | [Boundaries and operations](04-boundaries-operations.md) |
| Owner rejected the visual refresh | Restore the original presentation on every screen; retain the audited code fixes and add only interaction feedback. | [Web and design](03-web-design.md), [latest update](07-interaction-update.md) |

## Measured change

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`. Previous rejected draft: `b6980304ab8d1d743347cee4ab72b81056bc3e3e`. Earlier visual-review reports are historical and superseded.

| Scope | Original | After | Line change |
| --- | ---: | ---: | ---: |
| Production `src` TS/TSX/CSS, excluding tests | 6,731 | 6,650 | **1.20% reduction** |
| Persistence owners (`db/runs`, `db/client`, `server/runService`) | 387 | 243 | **37.21% reduction** |
| Legacy helper file `src/db/runs.ts` | 179 | 33 | **81.56% reduction in this file** |
| All source CSS, including tokens and imported styles | 560 | 576 | **2.86% increase** |
| Source + tests + operational scripts + migrations | 10,629 | 10,798 | **1.59% increase** |

Production source is also 0.78% smaller by UTF-8 bytes. Compared with the rejected draft, production lines fell 0.11% and bytes fell 0.50%. These are combined review outcomes; there is no measured percentage attributable solely to Ponytail or an automatic plugin. CSS file movement is counted across all imports and is not reported as debloat. Runtime dependencies remain nine.

See [measurement definitions](05-measurements.md) for denominators and [coverage](06-coverage.md) for every reviewed production module and operational surface.

## Verification and limits

Local verification: TypeScript, production build, real/fixture catalog checks, five fixture cases and the evaluation release gate; 180 non-DB tests. Own Chromium 153 checked the original and changed app at matching viewports/data: 116 flow + 8 accessibility checks each, plus additional original-layout/interaction checks. These cover six widths (320, 390, 700, 701, 1024, 1440), supported/unsupported haptic behavior, live reduced motion, press/disclosure/pending animation, posted-field redaction and native no-JS submission. Latest results and layout parity are recorded in [the interaction update](07-interaction-update.md).

The local screenshot database uses PGlite and a superuser connection. It demonstrates browser behavior, not native PostgreSQL role/RLS correctness. The [PR checks](https://github.com/zayd117/cafai/pull/12/checks) run PostgreSQL 16 with separate application/catalog/owner roles, all 194 tests including 14 DB tests, the build, evaluation and the browser checks. Their result is the authority for the migrated persistence tests.

No live Claude/Jev call, real-world recommendation quality score, SEO analytics or performance improvement is claimed. The five fixture cases are deterministic smoke/regression evidence, not the required 60–100 real labelled cases. The release gate passes, but H3/H4 research pass lines remain unmet and Jev remains unrun without a key. Human catalog verification, legal copy, Safari and full screen-reader review remain outstanding.

Audit findings about atomic budget reservation/per-call failure accounting and unmet requirements as hard blockers remain open. They require specific persistence/product-policy decisions; this change preserves the documented best-effort budget breaker and existing ranking semantics.

## Requested tooling

Ponytail and Thermo Nuclear are saved personal skills. The Caf.ai Review and Design skill contains selected pstack principles and frontend/SEO selection guidance; it is not a complete pstack orchestration install. Their checklists were used in this review and are persisted in the skill Git repository. See [tool provenance](../design/visual-refresh/02-tool-research.md).

Ahrefs has no callable tools in this session. The connected GSC Wizard read-only check worked but returned no properties. GSAP, Lenis and React Bits were researched; no runtime package/component was adopted because the present interaction uses native CSS and forms. Saving a skill does not connect an external account or install a frontend library.

## Detail files

- [Engine and privacy](01-engine-privacy.md)
- [Persistence](02-persistence.md)
- [Web and responsive design](03-web-design.md)
- [Catalog, evaluation and operations](04-boundaries-operations.md)
- [Measurements](05-measurements.md)
- [Coverage and retained behavior](06-coverage.md)

Latest visual decision and resumption status: [07-interaction-update.md](07-interaction-update.md). Physical haptic feel is not verified by desktop Chromium.
