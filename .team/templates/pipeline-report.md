# Pipeline report: <project>

Lead: technical-lead | Task: <TASK-id> | Date: <date>
Flow: Architect → Engineer → Reviewer → Optimizer
Rules: each stage verifies the previous stage's key claims before improving it; the reviewer is never the author; at most 2 review/rework loops, then escalate to the Boss; the Technical Lead runs the verification gate between stages.

## Stage 1: Architect (systems-architect)
Complete architecture: <path to architecture doc>. Handoff: <path>. Gate result: PASS | NEEDS_WORK.

## Stage 2: Engineer (full-stack-engineer)
Full implementation: <paths>. What was changed relative to stage 1 and why. Handoff: <path>. Gate result.

## Stage 3: Reviewer (code-reviewer)
Review findings: <path to review report>. Verdict. Rework loops used: <n> of 2. Gate result.

## Stage 4: Optimizer (performance-engineer)
Baseline and after measurements: <path to performance report>. Tests re-run. Gate result.

## Final production-ready version
Location, run instructions (from commands that actually succeeded), test results.

## Verification gates
Spot-checked VERIFIED claims per stage (at least 3 each): <list with result>.

## Open risks, ASSUMED and UNKNOWN items

## Escalations raised
<ESC ids and status>

## Status
COMPLETE | NEEDS_WORK | BLOCKED | NEEDS_BOSS
