# Architecture: <system or feature>

Author: <agent> | Task: <TASK-id> | Date: <date>
Confidence: HIGH | MEDIUM | LOW (reason)

<!-- Tag factual claims VERIFIED / INFERRED / ASSUMED / UNKNOWN. Scale and latency numbers are ASSUMED unless measured. -->

## Requirements and constraints
Functional, quality, scale, budget, deadline. Stated by the Boss vs ASSUMED.

## Existing system (if any)
What was inspected, with `path:line`. What was not inspected.

## System architecture
Overview diagram (text) and the reasoning for its shape.

## Component structure
Each component: responsibility, boundaries, owner, dependencies.

## Data flow
End-to-end for the main paths, including validation, storage, caching, exposure.

## API design
Contract-first: endpoints or messages, shapes, error model, versioning, auth.

## Database strategy
Engine and version, schema outline, integrity rules, migration approach. (Schema detail: database-engineer.)

## Caching strategy
For each cache: what, where, invalidation, TTL, justification.

## Scaling plan
Simplest architecture for current needs; the next scaling step; the metric that triggers it.

## Failure modes
What breaks, detection, degradation, recovery.

## Tradeoffs and decisions
Options considered, what was chosen and why. Links to `decisions/DEC-*.md`.

## Build now vs defer (MVP)
Build now: ...  Defer: ...

## Risks, assumptions, unknowns

## Next agent
