# Catalog, evaluation and operations review

## Catalog validation owns imported shapes

`loadCatalog` previously continued into semantic checks after AJV rejected a clients/taxonomy row. A YAML array containing `null` caused a TypeError instead of returning validation issues. Two regressions (clients and taxonomy) failed before the fix and pass now.

AJV validators now carry `ClientRecord[]`, `Capability[]` and `Offering` types. Imported YAML remains unknown until validation succeeds. An invalid clients/taxonomy schema returns the accumulated issues before semantic access. Valid offering documents are likewise narrowed by the existing validator.

This removes three blind domain casts and three redundant array fallbacks, without weakening the schemas, fixture separation, reference checks, trust rules, source-picture requirements or word limits. Invalid top-level shapes return early, so a single invocation no longer also enumerates downstream offering errors when clients/taxonomy are invalid. Fix the reported shape and rerun for later issues.

Both catalogs pass their schema/semantic checks: real 3 clients / 14 capabilities / 11 tools; fixture 3 clients / 6 capabilities / 8 offerings. Those checks do not prove current product claims, consent for third-party captures or legal compliance. Human catalog curation is still required.

## Evaluation classification

Metrics already owned `isUseful`. The bake-off's separate copy was removed and imports the canonical predicate. This changes two implementations to one, removing three readable source lines without adding a utility module or altering calculations. Metrics/bake-off regressions pass.

Five fixture cases now run across the default arms. The new negated-payments case requires no payments recommendation even when its model script is wrong. The release gate passes (zero harmful picks, zero invalid IDs, no regression against the existing baseline). H3/H4 research thresholds still fail; Jev is not run without a key. This is deterministic regression evidence, not real-world quality validation.

## Deployment smoke contract

The prior visual draft split the headline across inline spans, so a raw HTML substring check rejected a valid heading. Smoke now extracts the first h1's text, strips tags and normalizes spaces before checking the exact expected title. Added tests accept that split markup and reject a page with the expected words only in a paragraph.

Existing status, database-error, unknown-run 404, login/protection, deployment and environment assertions remain. Twelve scripted Vercel tests pass; no deployment was performed for this change.

## Retained operational boundaries

Reviewed migrations and access/grant definitions, runtime controls, pricing/retention, proxy/CSP, DB setup/deployment/worker scripts, evaluation/discovery scripts, capture scripts and CI workflows. Their ownership is already explicit; no new generic repository layer, schema wrapper, environment manager or tool-call registry is justified here.

Experimental discovery is separate from the closed-world recommendation engine and remains so. Existing source/provenance records, human acceptance gates, unknown-price treatment and append-only audit/usage rules remain. Account-backed Ahrefs/GSC data was unavailable; no SEO improvement percentage is claimed.
