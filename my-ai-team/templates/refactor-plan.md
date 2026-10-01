# Refactor plan: <area>

Author: <agent> | Task: <TASK-id> | Date: <date>
Confidence: HIGH | MEDIUM | LOW (reason)

## Current architecture breakdown
Current structure and its problems (separation of concerns, modularity, coupling, duplication). Cite `path:line`.

## Behavior baseline
Test command, baseline results, coverage gaps. Characterization tests needed: <list>.

## Must not change
- Public APIs, outputs, side effects, data formats: ...

## Target architecture
Principles applied proportionally (dependencies point inward, boundaries explicit). No layers imposed on a small application.

## New folder structure
```text
<tree>
```

## Migration steps (small, reversible, behavior-preserving)
1. ...  (test after each)

## Key improvements
What gets better and how it will be measured or checked.

## Risks and rollback

## Comparison after refactor (filled in after execution)
Test results before vs after; behavior comparison; diff review.

## Next agent
