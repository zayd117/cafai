# Audit report: <project or area>

Author: <agent> | Task: <TASK-id> | Date: <date>
Mode: AUDIT (no functionality modified)
Confidence: HIGH | MEDIUM | LOW (reason)

## Coverage statement
Inspected: ...
**Not inspected / not read:** ... (and why)

## Inventory
Languages, tree summary, build and test commands (VERIFIED by running or reading).

## Architecture breakdown
Entry points, layers, components, services, APIs, database access, authentication, state management, external dependencies, build system, deployment. Cite `path:line`.

## End-to-end data flow
Main paths traced, with `path:line` evidence.

## Findings (ranked by impact)
| # | Category | Finding | Evidence (`path:line`) | Source (read / tool) | Severity | Confidence |
|---|---|---|---|---|---|---|
Categories: duplicate logic, circular dependencies, coupling, dead code (checked by search incl. dynamic usage), large modules, inconsistent patterns, hidden side effects, performance, scalability, security, maintainability.

## Critical problem areas

## Refactoring strategies

## Improved code (proposed patches, NOT applied)
Patches live in `workspace/reviews/`: <paths>

## Must be preserved
Behavior, APIs, and outputs that must not change.

## Unverified / Unknown

## Next agent
