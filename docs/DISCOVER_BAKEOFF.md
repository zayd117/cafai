# Discovery bake-off: Claude alone vs Claude + Jev

Compares who rates queries and listings in the discovery loop (`npm run discover`), on accuracy, time, tokens and cost.
Exploratory, like the loop itself: it says nothing about quality until the cases are labelled by a person.

## What is compared

| Arm | Rates queries and listings | Shared by both arms |
|---|---|---|
| `claude` | Claude, asked the same questions Jev gets, one JSON reply per batch (`src/discover/claudeScorer.ts`) | Interpretation, mcp.market results (cached), ranking code |
| `claude+jev` | Jev (`src/discover/scorer.ts`) | same |

Because everything else is identical, any difference comes from the rater. Time and tokens cover the rating stage only.
Interpretation is reported once ("shared"). Search runs once in an untimed warm-up and is served from a cache, so neither
arm pays network time and both see the same listings. Explanations are excluded (same Claude call either way).
Arm order alternates between repeats.

## Run

```
npm run discover:bakeoff                                   # both arms, eval/discover/cases
npm run discover:bakeoff -- --repeats 5 --cache eval/discover/search-cache.json
npm run discover:bakeoff -- --arms claude+jev              # Jev only; needs no Claude key when the cases fix the interpretation
```

Needs `ANTHROPIC_API_KEY` for the `claude` arm and for any case without a fixed `interpretation`; a TypeSafe key for `claude+jev`.
An arm without its key prints `NOT RUN` and the other still runs. `--cache` reuses saved mcp.market responses, so a later
run compares against the same listings even if the directory changes (the cache file is git-ignored: it holds third-party text).

## Metrics

| Metric | Needs labels | Meaning |
|---|---|---|
| `precision_at_3`, `recall_at_5` | `relevant` | Share of the top 3 that are relevant; share of `relevant` found in the top 5. Unlabelled slugs count as not relevant. |
| `false_positive_rate` | `irrelevant` | Share of the top 5 that are listed as irrelevant |
| `bad_query_drop_rate` | `bad_queries` | Off-topic queries dropped before searching (drift catch) |
| `good_query_keep_rate` | `good_queries` | On-topic queries kept (over-filtering shows as a low number) |
| `consistency` | no | Mean top-5 overlap between repeats of a case. Retrieval is cached, so this measures the rater only. |
| `latency_p50_ms`, `latency_p95_ms` | no | Wall clock of the rating stage plus ranking |
| `input_tokens_per_run`, `output_tokens_per_run`, `cost_per_run_usd` | no | Every rating request in the run, priced from `src/config/pricing.ts`; a model with no price shows `—`, never free |
| top-5 agreement between arms | no | Jaccard overlap of the two arms' top 5, per case and repeat |

Agreement without labels tells you whether the arms differ, not which is right.

## Labelling (how accuracy gets a number)

1. Run once. `eval/reports/discover-pool.json` lists every listing either arm ranked, per case, with title, description and best rank per arm.
2. Judge each listing for that case from its description, without looking at which arm ranked it.
3. Put the slugs into the case file's `relevant` (a good answer contains these) and `irrelevant` (must not rank in the top 5).
4. Re-run with `--cache` so the listings match what you labelled.

New cases: copy `eval/discover/cases/_TEMPLATE.json`. Delete `interpretation` to let Claude interpret live, or keep it
to compare only the raters. Use 10 or more real cases before reading anything into the numbers, and fix any pass line before the run.

## Shipped cases

`excel-php-notifications` and `calorie-tracker` use the scripted interpretations from `npm run discover -- --mock`. Only
their query labels are set (one off-topic query each, off topic by construction), so ranking metrics print `—` until you label them.
