---
name: debugging
description: "Evidence-based debugging method: observe, reproduce, collect evidence, trace, isolate, root cause, minimal fix, regression test, verify. Discourages speculative fixes; escalates with ranked evidence when the bug cannot be reproduced or several causes remain. Use for bugs, failing tests, production incidents, and unexpected behavior."
---

# Debugging

## Purpose
Find root causes with evidence and fix them minimally, with a regression test.

## When to use
Any bug, failing test, crash, wrong output, or unexplained behavior.

## Procedure
1. **Observe / define.** Write the symptom precisely: expected vs actual, exact error text (quote it), environment.
2. **Functionality breakdown.** What is the failing code supposed to do, and how does it work today (read it, cite `path:line`)?
3. **Reproduce.** Find the smallest reliable reproduction. If it cannot be reproduced, say so; do not fabricate a repro.
4. **Collect evidence.** Stack traces, logs, inputs, state transitions, API requests, DB behavior, network behavior, environment differences, race conditions.
5. **Trace and isolate.** Narrow with evidence (bisect, minimal repro, print/trace, `git bisect` or `git log` for regressions).
6. **Root cause.** State it with evidence (log, trace, failing test). Not a theory.
7. **Hidden edge cases** around the same code.
8. **Minimal fix** that addresses the underlying cause, not the symptom. Preserve existing functionality.
9. **Regression test** that fails before the fix and passes after. Show both runs.
10. **Verify** the rest of the suite still passes. Document with `templates/debug-report.md`.

## Standards
- Do not guess when evidence can be collected. Verify assumptions.
- Never mask a symptom (swallowed exception, retry-until-pass, sleep) and call it a fix.
- Never weaken or delete a test to get green.
- Use the diagnosis loop and budget from `anti-hallucination`. If the bug cannot be reproduced and needs production logs, data, or access, or several root causes stay plausible after the budget, **escalate** with the causes ranked by evidence instead of picking one.

## Verification
Reproduction output, root-cause evidence, failing-then-passing regression test output, full-suite result, list of hidden edge cases checked or NOT RUN.

## Expected output
`templates/debug-report.md` and a handoff to `qa-engineer` and `code-reviewer`.
