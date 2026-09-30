# Discovery bake-off: Claude alone vs Claude + Jev

Compares who rates queries and listings in the discovery loop (`npm run discover`), on accuracy, time, tokens and cost.
Exploratory, like the loop itself: it says nothing about quality until the cases are labelled by a person.

## What is compared

| Arm | Rates queries and listings | Shared by both arms |
|---|---|---|
| `claude` | Claude, asked the same questions Jev gets, one JSON reply per batch (`src/discover/claudeScorer.ts`) | Interpretation, mcp.market results (cached), ranking code |
| `claude+jev` | Jev (`src/discover/scorer.ts`) | same |
| `claude-agent` | A Claude Code subagent's saved ratings, replayed (`eval/discover/ratings/claude-agent/<case>.json`). For when there is no API key. | same |

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
**Without an Anthropic API key**, run the Claude-alone arm through a subagent:

```
npm run discover:bakeoff -- --export-tasks <dir> --cache eval/discover/search-cache.json   # one <case>.task.md per case
# give each task file to a cold Claude Code subagent (it reads only that file); save its JSON as eval/discover/ratings/claude-agent/<case>.json
npm run discover:bakeoff -- --arms claude-agent,claude+jev --repeats 3 --cache eval/discover/search-cache.json
```

The task holds the same rating prompts as the API arm, no labels, and every listing any query retrieves (29 per shipped case,
rated in one pass instead of batches of five). Add `"meta": {"ms", "total_tokens", "tool_uses"}` to the JSON if you want them
reported. A query or listing the subagent skipped is an error run, never a zero. This arm's accuracy is comparable; its time,
tokens and cost are not metered like the API arms, so they print `—`. Its token total includes the subagent's fixed overhead, and
it is one run per case, so `consistency` for it is only 1 because the same ratings are replayed.

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

1. `npm run discover:labels -- --export` writes `eval/reports/discover-labelling-sheet.csv` (git-ignored: it holds third-party text) and saves the searches to `eval/discover/search-cache.json`. One row per listing that any of the case's queries retrieves (about 29 per case), in slug order with no rank or arm shown, so the labels hold for every arm. Cases without a fixed interpretation are skipped until Claude can interpret them.
2. Judge each row against the person's own words (the `need` column), from the listing text only. Fill `label` with `relevant` (a good answer contains it), `irrelevant` (must not rank in the top 5) or `unsure`. Leave it blank if either outcome is fine. `note` is free text and is not imported.
3. `npm run discover:labels -- --import <filled-sheet.csv>` writes the slugs into each case file's `relevant` and `irrelevant`. A misspelt label or unknown case stops the import and nothing is written. Blank rows change nothing; `unsure` removes the slug from both lists.
4. Re-run the bake-off with `--cache eval/discover/search-cache.json` so the listings match what you labelled. The cache is git-ignored and lasts only as long as the container: import in the same session, or export again (the directory may then return different listings).

Every arm reads the same labels; the older route is still there: a run also writes `eval/reports/discover-pool.json` (only the listings some arm ranked).

New cases: copy `eval/discover/cases/_TEMPLATE.json`. Delete `interpretation` to let Claude interpret live, or keep it
to compare only the raters. Use 10 or more real cases before reading anything into the numbers, and fix any pass line before the run.

## Shipped cases

`excel-php-notifications` and `calorie-tracker` use the scripted interpretations from `npm run discover -- --mock`. Only
their query labels are set (one off-topic query each, off topic by construction), so ranking metrics print `—` until you label them.

`hiking-trails-app` and `ios-apps-dashboards` are the first real interview answers (30 Sep 2026), words as given. Their interpretations
came from one live Claude call each and are saved in the case files, so both arms and the labelling sheet use the same items and queries
(7 items / 26 queries and 6 items / 26 queries, far more than the 5 of the shipped cases; the sheet has 185 and 149 rows for them). No labels yet.

In this project's environment the Anthropic key is stored as `CAFAI_ANTHROPIC_KEY`; the scripts read `ANTHROPIC_API_KEY`, so run with
`ANTHROPIC_API_KEY="$CAFAI_ANTHROPIC_KEY" npm run discover:bakeoff -- ...` until the variable is renamed.

## First live run (30 Sep 2026): no accuracy number yet

4 cases, 3 repeats, `claude` (claude-sonnet-5-5) vs `claude+jev` (jev-1.13.0), live mcp.market cached, 0 errors. Unlabelled, so precision,
recall and false positives print `—`. Query drop/keep rates use the one off-topic query set in the two shipped cases, so they say little.

| | claude | claude+jev |
|---|---|---|
| Bad queries dropped / good queries kept | 1 / 1 | 1 / 1 |
| Top-5 consistency across repeats | 0.73 | 0.94 |
| Time per run, p50 / p95 | 7.7 s / 14.4 s | 0.57 s / 1.1 s |
| Input / output tokens per run | 16.3k / 7.6k | 42.4k / 7.5k |
| Cost per run | $0.108 | $0.0018 |

Top-5 agreement between the arms is 0.32 (per case: calorie 0.43, excel 0.25, hiking 0.25, ios 0.37). Per-case cost on the real cases:
hiking $0.214 vs $0.004, ios $0.159 vs $0.002. Observations: both arms dropped 12 of 26 (hiking) and 14 of 26 (ios) queries, including
"Google Maps JavaScript API" for a person who named Google Maps; whether that is over-filtering needs labels. Jev sends more input tokens (not investigated why)
but its output is free, so it costs far less. The two top 5s differ by 2 to 3 of 5 listings per case (majority over the 3 repeats); those
listings are what the labelling sheet should settle.
