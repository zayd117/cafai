# Debug report: <symptom>

Author: <agent> | Task: <TASK-id> | Date: <date>
Confidence: HIGH | MEDIUM | LOW (reason)

## Functionality breakdown
What the failing code is supposed to do and how it works today (`path:line`).

## Symptom (expected vs actual)
Exact error text quoted. Environment.

## Reproduction
Steps and command with output. If it could not be reproduced, say so here.

## Evidence trail
Trace, logs, bisect, isolation steps, with output (VERIFIED).

## Root cause
Stated with evidence (log, trace, failing test). Not a theory. If several causes remain plausible, list them ranked with evidence and escalate.

## Hidden edge cases
Edge cases around the same code: checked or NOT RUN.

## Fix
Minimal production-ready fix (diff). Why it addresses the cause, not the symptom. Existing functionality preserved.

## Regression test
Test added. Run before the fix (fails) and after the fix (passes), both outputs shown.

## Verification
Full suite result (command, counts, exit status).

## Unverified / Unknown

## Next agent
