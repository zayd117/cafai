# Measurement definitions

Baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`; prior visual draft: `104a902245938f7dbd72bdd4e67acc85febfcac7`. After means this PR's reviewed production source, fingerprinted by the sorted path→SHA-256 manifest hash `4aebadaa35749a8b94e20e94e96e04dfd18569273e2e174bd4c79fb8450d15b6`.

Use `(before - after) / before × 100` for reduction. Count physical readable lines and UTF-8 bytes, including comments and whitespace. No reformatting/minification was performed to optimize the count. No bundle-size, speed, readability or recommendation-quality percentage is inferred from these counts.

| Metric | Original | Previous visual draft | After | Change from original |
| --- | ---: | ---: | ---: | --- |
| Production source lines | 6,731 | 6,779 | 6,657 | −74; **1.10% reduction** |
| Production source bytes | 340,388 | 343,878 | 339,422 | −966; **0.28% reduction** |
| Production files | 73 | 78 | 78 | +5 style ownership files |
| Persistence owner lines | 387 | 387 | 243 | −144; **37.21% reduction** |
| Persistence owner bytes | 16,843 | 16,843 | 10,490 | −6,353; **37.72% reduction** |
| `db/runs.ts` lines | 179 | 179 | 33 | −146; **81.56% reduction in this file** |
| `db/runs.ts` bytes | 8,149 | 8,149 | 1,686 | −6,463; **79.31% reduction in this file** |
| All source CSS lines | 560 | 598 | 605 | +45; **8.04% increase** |
| All source CSS bytes | 45,756 | 48,055 | 48,972 | +3,216; **7.03% increase** |
| Source + tests + operational code lines | 10,629 | 10,738 | 10,776 | +147; **1.38% increase** |
| Source + tests + operational code bytes | 568,725 | 576,502 | 583,502 | +14,777; **2.60% increase** |
| Runtime dependencies | 9 | 9 | 9 | No additions |

Production scope: all `src/**` `.ts`, `.tsx`, `.css`, excluding `.test.` files. CSS includes `tokens.css`, the import entrypoint and every stylesheet; moving rules between files does not reduce the sum. Persistence scope: `src/db/runs.ts`, `src/db/client.ts`, `src/server/runService.ts`.

The broader scope includes code in `src`, `scripts` and `db/migrations` with `.ts`, `.tsx`, `.css`, `.mjs`, `.sh`, `.sql` suffixes, including tests. It excludes assets, docs, generated output, lockfiles and external measurement/capture tools. Its growth reflects added regression evidence and behavior checks. It is not the total repository byte size.

Compared with the previous visual pass, production source falls **1.80% by lines** and **1.30% by bytes**. The previous pass alone increased production lines by 0.71%; this audit is the pass that produces a net reduction from the original source.

## Counted duplication and unsafe boundary constructs

| Scoped count | Before | After | Change |
| --- | ---: | ---: | --- |
| Run creation implementations | 2 | 1 | 50% fewer implementations |
| Run reader implementations | 2 | 1 | 50% fewer implementations |
| Six identified obsolete DB helper entrypoints | 6 | 0 | 100% of this obsolete set removed |
| Useful-pick classification implementations | 2 | 1 | 50% fewer implementations |
| Blind catalog domain casts | 3 | 0 | 100% of this identified set removed |
| Redundant catalog array fallback guards | 3 | 0 | 100% of this identified set removed |

These are counts of identified constructs, not a repository-wide repeated-code percentage or a universal type-safety score. No similarity detector was used. The review used Ponytail, selected pstack principles and Thermo Nuclear together; none has an isolated causal effectiveness measurement in this project.
