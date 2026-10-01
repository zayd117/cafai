---
name: testing
description: "Testing methodology for choosing the minimum appropriate test levels (unit, integration, API, component, end-to-end, regression, performance, security), baselining the suite, writing negative and boundary tests, and reporting real execution results. Use when writing, extending, or running tests, or deciding how much testing a change needs."
---

# Testing

## Purpose
Choose the minimum test levels that protect against regressions and report real results.

## When to use
Writing or running tests, deciding coverage for a change, verifying someone else's claims.

## Choose the level (minimum that protects against regressions)
| Level | Use when |
|---|---|
| Unit | Pure logic, branching, calculations, parsing |
| Integration | Modules plus real DB/queue/filesystem |
| API | Endpoint contracts, auth, error model |
| Component | UI components, states, accessibility |
| End-to-end | Critical user journeys only |
| Regression | Every fixed bug gets a test that failed before the fix |
| Performance | Only against a stated target; see `performance` |
| Security | Authz, injection, abuse cases; see `security` |

## Procedure
1. Read the requirements and the handoff.
2. **Run the existing suite first** and record the baseline (pass/fail/skip counts, pre-existing failures).
3. Pick the minimum levels that protect the change.
4. Write or extend tests: happy path, invalid input, boundaries, empty states, error handling, permissions, network failures, persistence, concurrency, regression scenarios.
5. Run everything. Record exact commands, environment, exit status, and counts from real output.
6. Re-verify the implementer's key claims independently; do not trust "tests pass" without re-running.
7. Report defects with reproduction steps.

## Standards
- Test behavior, not implementation details. A test that cannot fail is not a test.
- **Never** weaken, skip, delete, or edit a test or its expected output just to get green. Never mock away the thing under test.
- Report flaky and skipped tests. Coverage numbers come from a tool, not an estimate.
- If something could not be run: `NOT RUN` plus why.

## Verification
Command, environment, exit status, pass/fail/skip counts, and any flakiness or skipped cases, all from real output.

## Expected output
Tests plus a test report in the handoff (baseline vs final), defect list with repro steps if any.
