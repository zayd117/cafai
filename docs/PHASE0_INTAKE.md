# Phase 0 intake: from interviews to test data

How to turn each Phase 0 conversation (plan §25, §29) into files the engine and the bake-off can use.
Nothing here is ever invented: every case, capability and tool comes from a real conversation or a real vendor source.

## Per person (plan §29, weeks 1–2)

1. **Interview** (15–20 people who build with AI tools, beginners to experts). Ask about their last tool search: what
   they looked for, where, what stopped them, which AI tools they use daily. Keep notes outside the repo.
2. **Collect the description** in their own words. Remove secrets, emails, phone numbers and names.
3. **Save a baseline answer**: paste the same description into ChatGPT or Claude chat followed by
   "What tools should I add?" and copy the full answer, unedited. GPT is the baseline only, never part of the engine.
4. **Return concierge picks within 48 hours**, by hand, and log the minutes it took.
5. **Day 7 follow-up**: which picks they tried, which helped, which they already knew.

## Files to write

| What | Where | Template | Check |
|---|---|---|---|
| One case per person | `eval/cases/real/<id>.json` | `eval/cases/real/_TEMPLATE.json` | `npm run cases:check` |
| Capabilities you saw them need | `catalog/taxonomy.yaml` | `catalog/templates/capability.yaml` | `npm run catalog:check` |
| Tools you recommended | `catalog/offerings/<id>.yaml` | `catalog/templates/offering.yaml` | `npm run catalog:check` |

Labels in a case:

| Field | Put here |
|---|---|
| `must_recommend` | Capabilities a good answer must cover |
| `acceptable_offerings` | Tools that would be fine picks |
| `must_not_recommend` | Tools or capabilities that would be harmful or wrong here (any hit is a harmful pick) |
| `potentially_missed` | Needs the person did not name but should hear about (H6) |
| `probably_not_needed` | Things a good answer should leave out |
| `expected_outcome` | Only for special cases: `nothing_needed`, `out_of_scope`, `needs_clarification` |

Input types (§25), about 8–12 cases each:

| Type | The person… | Usually from |
|---|---|---|
| A | knows exactly what they want | reworded real case |
| B | knows the problem, not the solution | concierge |
| C | only says what they are building | concierge |
| D | is a beginner, plain words | concierge |
| E | uses highly technical language | concierge |
| F | is vague | concierge |
| G | names a technology that is the wrong answer | reworded real case |
| H | has a project where an unexpected resource helps | concierge or reworded |

Also add adversarial cases (`source: "adversarial"`): injected instructions, nonsense, non-English.

## Then run

```
npm run catalog:check && npm run cases:check
npm run eval -- --cases eval/cases/real --live --repeats 3 --arms llm,llm+jev,no_expansion,forward_only,evidence_gates_off
npm run eval -- --cases eval/cases/real --live --export-pairs out/blind --seed <a secret phrase>
npm run eval -- --score-pairs out/blind/key.json out/blind/judgments.json
```

Before the real run, fix the numbers in `eval/bakeoff.json` and do not change them afterwards (§25: pass lines are
written before the run). Give judges only `out/blind/pairs.json`; keep `key.json` away from them.
