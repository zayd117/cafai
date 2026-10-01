---
name: code-review
description: "Independent code review methodology: re-run before trusting, hallucination audit (every symbol, package, endpoint, flag, config key exists), correctness and boundary review, test-strength review, scope-creep check, severity scale (BLOCKER/MAJOR/MINOR/NIT), and verdict rules (APPROVE/CHANGES_REQUESTED/BLOCK). Use when reviewing a diff, a handoff, or another agent's work."
---

# Code review

## Purpose
Give independent, evidence-based review that catches defects, fabricated references, weakened tests, and scope creep.

## When to use
Reviewing a diff, a pull request, or another agent's handoff. The reviewer is never the author of what they review.

## Procedure
1. **Read** the handoff and the full diff (`git diff` against the stated base).
2. **Re-run before trusting.** Run the build and the tests yourself. Do not accept reported results. Record the commands and output.
3. **Hallucination audit.** For every import, symbol, package, endpoint, CLI flag, env var, and config key the change uses: confirm it exists (read the definition, check the lockfile or registry, run `--help`). Flag any you cannot confirm.
4. **Correctness and boundaries.** Edge cases, null/empty/large inputs, error handling, timeouts, idempotency, concurrency, resource cleanup, security smells (injection, authz, secrets), backward compatibility.
5. **Test strength.** Do the tests assert behavior, or were they weakened (loosened assertions, deleted cases, skipped tests, mocks of the thing under test)? Would they fail if the code were wrong? Where practical, prove it: break the code and watch the test fail.
6. **Scope creep.** Is every changed file justified by the task? Flag drive-by edits and unrelated changes.
7. **Write findings** with severity, `path:line`, evidence, and a suggested fix. Separate real defects from style nits.
8. **Verdict.**

## Severity scale
- BLOCKER: wrong behavior, data loss, security hole, fabricated/nonexistent reference, weakened or fake test, claim contradicted by evidence.
- MAJOR: likely bug, missing error handling or test on an important path, significant maintainability risk.
- MINOR: small defect or gap with limited impact.
- NIT: style or preference. Never blocks. Keep these in a separate section.

## Verdict rules
- APPROVE: no BLOCKER or MAJOR; independent re-run passed; every central claim verified.
- CHANGES_REQUESTED: any MAJOR, or a failed independent re-run, or an unverifiable central claim.
- BLOCK: any BLOCKER, or a decision that needs a Boss scope call (escalate).
- More than 2 rework loops on the same item: escalate to the Boss.

## Standards
Findings cite `path:line`; no invented issues. Say what you did not review. Do not review your own work.

## Verification
Re-read every cited `path:line` to confirm the finding is real; confirm the re-run output is recorded; run the Claim Audit (see `anti-hallucination`) on the review itself.

## Expected output
`.team/templates/review-report.md`: findings by severity, verdict, the list of claims you independently verified with the commands you ran.
