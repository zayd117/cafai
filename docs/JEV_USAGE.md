# How Caf.ai uses Jev (review, 30 Sep 2026)

Jev (TypeSafe, `jev-1.13.0`) answers questions with probabilities. It does not write text. Caf.ai uses it in two places: the discovery
loop (`src/discover/led.ts`, `src/discover/scorer.ts`) and the engine's stage 8 (`src/engine/providers/jev.ts`, REGISTER A-040).

## What we measured about Jev itself

Live probes, 30 Sep 2026:

| Question | Answer | What it means for us |
|---|---|---|
| Same request twice, same answers? | Within 0.03 | Saved answers can be replayed (the known-item test does, `cachedPostFetch`). Repeats add little. |
| Does an answer change with the other questions in the request? | Within 0.01-0.03 | Batching is transport only; batch sizes can be chosen for speed. |
| Can a result's text go once in `state`, referred to by id? | 19 of 20 yes/no answers unchanged | The "compact" mode: each result's text is sent once, not once per question. |
| `choice` over a list | One probability per option | One pick-the-best question can order a whole shortlist. |
| `score` (graded rubric) | Works | Tried for per-need fit: more tokens, no accuracy gain. Not used. |

## Rules the discovery loop follows

1. Jev only rates what Claude wrote and what the directory returned; code does the arithmetic, the searching and the final cut.
2. Jev never sees the person's raw words (A-040/A-043), only the read-back needs.
3. Every question is asked in a way that cancels position bias: pick-the-best is asked twice with the list reversed.
4. Text goes to Jev once per request (compact mode), and only the 20 most promising results get the full set of questions (the screen).
5. A missing answer is counted (`JevScorer.missing`), never hidden. The known-item test prints it; it has been 0.
6. The screen and the final ordering are optional: if either request fails, the loop keeps the ratings' order and reports it (`degraded`).
7. Every request is tagged with its step, so tokens can be traced (`usage[].step`).

## Where the tokens go now (per search, 28 test projects)

| Step | Input tokens | Share |
|---|---|---|
| Screen every result (one question each) | 11.0k | 43% |
| Full rating of the best 20 | 10.1k | 40% |
| Rate the queries | 2.0k | 8% |
| Order the shortlist (pick-the-best, twice) | 1.4k | 6% |
| Weigh the needs | 0.9k | 4% |
| Total | 25.5k (was 81.7k) | $0.0011 per search (was $0.0034) |

Jev's published limits (docs.typesafe.ai/models, may change): 100k tokens and 40 requests per second. At 25.5k tokens and 11.9 requests per
search, one key serves about 3.4 searches per second (limited by requests), against about 1.2 for the first Jev-led version.

## Open gaps, most important first

1. **Claude alone has not been compared with the current loop.** The Anthropic account is out of credit. Run
   `npm run discover:known -- --arms claude,jev-classic,jev-led` once it has credit (about $5 for the 28 tasks).
2. **No human-labelled accuracy yet.** The known-item test counts one right answer per project and uses stand-in interpretations. The
   labelling sheet (`npm run discover:labels -- --export`) is the real test.
3. **Jev cannot tell needs the person asked for from needs Claude assumed**, because it never sees their words. Two options: send the
   person's words to Jev (a privacy change, the user's call), or have Claude mark each need "asked for" or "assumed" (no new data leaves;
   needs a Claude prompt change and credit to test).
4. **The engine's stage 8 keeps only Jev's top choice and throws away the probabilities** (`src/engine/providers/jev.ts`: `intent`,
   `item`, `requires`). The probabilities could feed the Confidence score (A-040 item 3). This is an engine change and not done.
5. **All thresholds are placeholders** (`LED_CONFIG`, `DISCOVER_CONFIG`, `JEV_THRESHOLDS`). The known-item test tuned four switches,
   not the numbers; the numbers wait for labels.
6. **Six of 28 test projects never had the right listing searched for**, because none of Claude's queries found it. Jev cannot fix that; a
   second round in which Claude writes new queries for needs with no good match (`gaps` in the result) could.
