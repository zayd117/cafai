# Caf.ai visual refresh: review before merge

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd` (`main`, the exact commit in the supplied repository audit). Date: 2026-10-09.

The user authorized a visual rebuild and useful restructuring, then explicitly required screenshots and approval before merging. Keep this change in draft until that review is complete. The existing audit is the change-impact map; current code and tests remain the authority.

## What changed

- Rebuilt the intake as an editorial introduction beside the existing composer on desktop, stacking naturally on phones. Kept the café mark, green palette, canonical example journeys, question heading, form field names and native form action.
- Made the project label visible, improved input spacing, raised the primary action to a 52px target and kept compact choices at 44px.
- Reused the existing `SubmitButton` for the primary action and three examples. They disable during submission; the pressed action has an explanatory pending label. No new pending-state framework was introduced.
- Refined results spacing, selection borders, numbered ranks, the green order summary, setup spacing and the shared footer. Kept decision-first short cards, read-back editing, source previews, order selection and user-controlled setup.
- Split the stylesheet by responsibility: base, intake, results, setup and responsive/footer. The six-line global file imports those owners in the existing cascade order. Fixed the collision between banner markers and editable tags by scoping banner marker styling.
- Consolidated shared button transitions and disabled styles, removed a redundant pick-card gap rule, and extended existing high-contrast checkbox treatment to the intake.
- Added a short CSS entrance that leaves content visible. Live reduced-motion preferences are handled by media queries, with no JavaScript, scroll replacement, animation library or additional runtime dependency.
- Added `scripts/design-flow.mjs` for narrow screens, reduced motion, focus, pending-state behavior and no-JavaScript submissions. CI retains screenshots on successful runs as well as failed ones so this review has retrievable evidence.

Engine, scoring, catalog, server actions, database, RLS, provider adapters, quota controls and production settings were not changed. Existing audit findings about negation, redaction and release readiness remain separate work.

## Measured size changes

Measurement: UTF-8 bytes and physical lines from `git show <baseline>:src/app/globals.css`, compared with the concatenation of the new global entrypoint and all five style owners. Percent change = `(after - before) / before * 100`. Comments and whitespace count. These are source measurements, not browser bundle or performance measurements.

| Metric | Before | After | Change | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Largest stylesheet | 427 lines | 240 lines | **43.79% smaller** | Better ownership and smaller files to review; moved code is not deleted code. |
| Global CSS entrypoint | 427 lines | 6 lines | **98.59% smaller** | Import-only entrypoint; this is restructuring, not total debloat. |
| All CSS source | 427 lines | 465 lines | **8.90% larger** | Added the redesigned layout and motion. |
| All CSS source bytes | 39,134 | 41,433 | **5.87% larger** | No claim of net CSS payload reduction. |
| Runtime dependencies | 9 | 9 | **0% growth** | Package manifests and lockfile are unchanged from the baseline. |
| Shared button transition definitions | 2 | 1 | **50% fewer** | One canonical button rule replaces the competing scoped definition. |
| Pending/disabled styling blocks in the first redesign draft | 2 | 1 | **50% fewer** | Consolidated result-button and intake-button behavior. Draft comparison, not the old site. |
| Added animation packages in the first redesign draft | 2 | 0 | **100% removed** | Removed GSAP and its React adapter after review showed native CSS sufficed. Draft comparison. |

A total-project “X% less code” claim would be misleading: this redesign adds presentation and verification code. The genuine improvements are ownership, fewer overlapping rules, reuse of pending behavior, and avoiding a JavaScript animation subsystem. No runtime speed, bundle-size, accessibility-score or duplicate-code-percentage claim is made without its measurement.

See [01-review.md](01-review.md) for structural review and [02-tool-research.md](02-tool-research.md) for the requested resources. Exact validation and fresh screenshots belong in [03-verification.md](03-verification.md).
