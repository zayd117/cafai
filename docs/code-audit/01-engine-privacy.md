# Engine and privacy review

## F01: direct rejection was treated as a requirement

Before: `I do not need to accept payments.` matched a taxonomy phrase and the rules upgraded it to `stated`, even when the model classified it as unnecessary. The new fixture deliberately scripts that wrong model classification and requires no payments pick.

`understand.ts` owns the correction. It examines each occurrence's local prefix, recognizes direct rejection, and records `not_relevant` with the original sentence as evidence. An affirmative mention of the same capability still wins if the user explicitly needs it elsewhere. Existing `present` classifications remain preserved. Bare phrases cannot override model `not_relevant`; questions and uncertainty are left to the model.

Regression evidence: the first 27-case test run failed 26 tests before the change; the final 33-case suite passes. It tests positive/rejected pairs across all 20 real/fixture capability families, direct rejection variants, mixed and repeated clauses, uncertainty and model contradictions. The fifth fixture adds an end-to-end exclusion case to every evaluation arm.

Limit: these are direct English patterns immediately preceding known phrases. Compound negation, long-distance scope, quoted hypothetical examples and other languages still need model interpretation and real labelled cases. This does not establish a recommendation-quality percentage.

## F02: edited and generated read-back fields

The existing raw-input redaction did not cover every read-back field. User edits could retain a key in an item tag/suggestion; a model could place an email in its item text and fallback label. These fields can be persisted and used by downstream model stages.

Canonical owners now sanitize them:

- Server actions redact specific requests, edited item text, tags, quotes, added sentences and clarifying answers before their field length limits. This avoids slicing a key into an unrecognizable fragment first.
- `cleanTag` redacts before whitespace normalization and the final 40-character limit. Suggestions already pass through that cleaner and deduplicate there.
- `shortTag` redacts its text before shortening.
- `understand` redacts model item text before fallback labels, persistence and downstream requests. Existing quote validation remains tied to redacted user evidence.

The three new privacy regressions failed before the patch and pass afterward. They check returned items and recorded scripted provider requests. A native DB regression checks saved context/profile/loadRun output; an own-Chromium crafted-form check posts secret-bearing hidden fields and confirms the saved edited text is redacted, proving that the action actually used the payload.

Limit: redaction detects the existing documented patterns; it is not a guarantee of removing every possible personal datum. Historical snapshots are unchanged, and no sweeping sanitization of every generated explanation string is claimed.

## Core contracts retained

`pipeline`, `match`, `assemble` and `explain` retain the closed catalog, evidence checks, flagged-tool exclusion, lane/cap rules, score/confidence separation and explanation fallback. `schemas`, prompts and provider adapters remain their validation/transport owners. User IDs, evidence mapping, edit/remove behavior and immutable historical runs stay intact.

No generalized policy registry, phrase-analysis service or shared transport configuration framework was added. Anthropic engine and discovery adapters have different schema/request/usage responsibilities; extracting their superficial transport overlap would introduce a broader API without removing an actual ownership problem in this pass.
