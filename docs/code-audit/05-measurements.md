# Measurement definitions

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`; rejected draft: `b6980304ab8d1d743347cee4ab72b81056bc3e3e`. After means this PR's current production source, fingerprinted by the sorted path→SHA-256 manifest hash `cc41eb08927663af4c36923aadc2fc88ef11ffc2a3c860f06d43f8dac8d8b748`.

Reduction is `(before − after) / before × 100`. Count physical readable lines and UTF-8 bytes, including comments/whitespace. No minification or reformatting was used to optimize the figure. Moving CSS does not count as deleting it. These counts do not measure bundle size, speed, real-world recommendation quality or one skill’s causal effectiveness.

| Metric | Original | Rejected draft | After | Change from original |
| --- | ---: | ---: | ---: | --- |
| Production source lines | 6,731 | 6,657 | 6,650 | **1.20% reduction** |
| Production source bytes | 340,388 | 339,422 | 337,722 | **0.78% reduction** |
| Persistence owners lines | 387 | 243 | 243 | **37.21% reduction** |
| Persistence owners bytes | 16,843 | 10,490 | 10,490 | **37.72% reduction** |
| All source CSS lines | 560 | 605 | 576 | **2.86% increase** |
| All source CSS bytes | 45,756 | 48,972 | 46,976 | **2.67% increase** |
| Source + tests + scripts + migrations lines | 10,629 | 10,776 | 10,798 | **1.59% increase** |
| Source + tests + scripts + migrations bytes | 568,725 | 583,502 | 584,571 | **2.79% increase** |
| Runtime dependencies | 9 | 9 | 9 | No additions |

Production scope: all `src/**` `.ts`, `.tsx`, `.css` excluding `.test.` files. Persistence scope: `src/db/runs.ts`, `src/db/client.ts`, `src/server/runService.ts`. CSS includes tokens and all imported files. Broader scope includes code in `src`, `scripts`, `db/migrations` with `.ts`, `.tsx`, `.css`, `.mjs`, `.sh`, `.sql` suffixes, including tests; assets, docs, generated output and lockfiles are excluded.

The original CSS is restored byte-for-byte. Sixteen interaction-only CSS lines and one small client feedback boundary are added; the five rejected styling files are removed. The core code audit’s six-helper deletion and security/privacy fixes remain. Source including tests/scripts grows because regression evidence is retained.

## Scoped duplication counts

| Count | Original | After | Change |
| --- | ---: | ---: | --- |
| Run writer implementations | 2 | 1 | 50% fewer |
| Run reader implementations | 2 | 1 | 50% fewer |
| Identified obsolete DB helper entrypoints | 6 | 0 | 100% of that obsolete set removed |
| Useful-pick predicate implementations | 2 | 1 | 50% fewer |
| Blind catalog domain casts | 3 | 0 | 100% of that identified set removed |
| Redundant catalog array guards | 3 | 0 | 100% of that identified set removed |

`db/runs.ts` remains 179 → 33 lines (81.56% fewer in this file), 8,149 → 1,686 bytes (79.31% fewer). Combined persistence owners remain 387 → 243 lines (37.21% fewer). These scoped percentages are not whole-repository savings. Ponytail, selected pstack guidance and Thermo Nuclear were applied together; no isolated skill effectiveness percentage is established.
