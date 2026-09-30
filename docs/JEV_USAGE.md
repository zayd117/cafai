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

## The handshake: does what came back match what was searched for? (30 Sep 2026)

Each shown result has a path: a need, the search written for it, and the result. Jev checks three links: the search fits the need (query
score), the result does what the search looked for, and the result does what the need asks. A result counts as verified for a need only as
far as the result-side checks agree (the lower of the two); one found only by another need's search counts its fit at 85%. The path is kept
on each result (`path`: need, search, and the three numbers), so an explanation can say why it is there.

Three ways to use it, all switches in `LED_CONFIG`, tested on the 28 known-item projects and on a junk test (four off-topic tools from other
projects slipped into each project's directory replies, 112 look-alike and 112 random):

| | Right tool first | In top 5 | Junk in top 5 (look-alike) | Tokens |
|---|---|---|---|---|
| No handshake (before) | 46% | 61% | 1 project | 25.5k |
| Check only what is shown (`verifyShown`, now on) | same | same | 1 project | +1.4k |
| Handshake inside the ranking (`handshake`) | 39-46% | 54-57% | 0 | +1.4k |

What that means: Jev's per-need checks already keep junk out. The planted results that reached a top 5 were not off-topic: Box for a
family document archive, and tools the project's own searches also return further down the directory's list (not checked by a person). So the handshake has little left to catch in this test and, inside the ranking, it cost some accuracy. The check on what is shown
changes nothing measured, costs about 6% more tokens and one request (about 0.15 s), and gives every shown result a checked reason; it stays
on for that and as a guard against descriptions that oversell (not something this test can measure).

Also built and measured: results grouped by need (`layout: "by-need"`: each need's verified candidates, Jev picks the best within each
need, the list takes turns across needs) and a hybrid (`"hybrid"`: the overall best first, then turns). Hybrid vs the flat list: right tool
first the same (46%), right tool in top 5 50% vs 61%, right tool somewhere on screen 19 vs 18 of 28 (about 11 results shown vs 8), needs
with a match in the top 5 94% vs 91%, most top-5 slots taken by one need 2.0 vs 2.7. The known-item test rewards stacking similar tools, so it
cannot settle this; it is a product call to make with real people. A second search for needs nothing matched (`gapQueries`) is built and
never triggered: every need already had a match.

Where the right tool was lost, default loop, 28 projects: ranked first 13, ranked 2-5 4, never returned by any search 6, rated but not
shortlisted 3, shortlisted but below 5 1, screened out 1. Four of the five losses after search were crowded needs (ten weather services all
rated about 0.93, many equal document readers): the right tool was one of several equally good ones. The fifth lost context: the person
said Rajasthan, the needs list did not, and an India-specific maps service lost to general ones.

## Rules the discovery loop follows

1. Jev only rates what Claude wrote and what the directory returned; code does the arithmetic, the searching and the final cut.
2. Jev never sees the person's raw words (A-040/A-043), only the read-back needs.
3. Every question is asked in a way that cancels position bias: pick-the-best is asked twice with the list reversed.
4. Text goes to Jev once per request (compact mode), and only the 20 most promising results get the full set of questions (the screen).
5. A missing answer is counted (`JevScorer.missing`), never hidden. The known-item test prints it; it has been 0.
6. The screen and the final ordering are optional: if either request fails, the loop keeps the ratings' order and reports it (`degraded`).
7. Every request is tagged with its step, so tokens can be traced (`usage[].step`).
8. Before the list goes out, each shown result is checked against the searches that found it (`verifyShown`); a result that fails moves
   below the ones that pass and is flagged weak.

## Where the tokens go now (per search, 28 test projects)

| Step | Input tokens | Share |
|---|---|---|
| Screen every result (one question each) | 11.0k | 41% |
| Full rating of the best 20 | 10.1k | 38% |
| Rate the queries | 2.0k | 7% |
| Check what is shown against its searches | 1.5k | 5% |
| Order the shortlist (pick-the-best, twice) | 1.4k | 5% |
| Weigh the needs | 0.9k | 4% |
| Total | 27.0k (first Jev-led version 81.7k) | $0.0011 per search (was $0.0034) |

Jev's published limits (docs.typesafe.ai/models, may change): 100k tokens and 40 requests per second. At 27k tokens and 12.9 requests per
search, one key serves about 3.1 searches per second (limited by requests), against about 1.2 for the first Jev-led version. A fresh run
takes about 1.0 s per search.

## Open gaps, most important first (updated after the handshake work)

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
   second round in which Claude writes new queries for needs with no good match (`gaps` in the result) could. The free version (unused
   queries) is built (`gapQueries`) but never triggered in the tests.
7. **The handshake checks claims, not tools.** Both sides are words: Claude's search and the listing's own description (third-party,
   300 characters). A description that oversells passes. Only signals outside the text (the directory's grade, installs, people's feedback)
   can check the tool itself.
8. **Numbers from different Jev questions are not on one scale.** A pick-the-best share is split across the options; a yes/no is not. So the
   handshake compares each link with a bar and takes the weakest, never the raw numbers with each other.
9. **Crowded needs cannot be ranked on relevance alone.** When ten services all fit, the tie-breakers a beginner cares about are missing:
   free or paid, needs an account or key, how hard to set up. Worth one Jev question each on the shortlist, and a way to test it (people).
10. **Context gets lost between the person's words and the needs list** (Rajasthan, iOS, Google Maps). Have Claude return a short list of
   must-haves (place, platform, named tools, budget, skill level) that Jev checks each shown result against. No raw words leave. Needs credit.
11. **One list is the wrong shape for most projects.** Most have five to seven needs; the flat top 5 gives one need 2.7 slots on average.
   Grouped or hybrid display is built; which one people prefer needs real people.
12. **Nothing learns from what people pick.** Anonymous "this helped / this didn't" per result (no accounts, fits A-042) would turn the
   placeholder thresholds into measured ones over time.
13. **Claude never needs to handle the search results.** Routing results through Claude would cost 50 to 100 times what Jev costs per
   check and adds no checking Jev does not already do; Claude's value is writing the searches and explaining the picks.
