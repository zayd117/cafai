---
name: architecture
description: "Repeatable process for system architecture: requirements, inspect existing architecture, constraints, components, data flow, API design, data storage and caching, scaling path, failure modes, tradeoffs. Simplicity first, evolutionary scalability. Use when designing or re-designing a system, planning a refactor, or auditing structure."
---

# Architecture

## Purpose
Produce the simplest architecture that meets current and foreseeable needs, with a clear scaling path.

## When to use
Designing a new system or feature, re-designing infrastructure, planning a refactor, or documenting how an existing system fits together.

## Procedure
1. **Requirements.** Functional needs, quality needs, scale, budget, deadline. Anything the Boss did not state is ASSUMED and labeled, or asked about.
2. **Inspect the existing architecture** before recommending anything (read the code, configs, schemas, `.team/decisions/`, `.team/workspace/architecture/`). No greenfield assumptions. Cite `path:line`.
3. **Constraints.** Team size, stack, hosting, compliance, existing contracts.
4. **Map components** and their boundaries. Each component has one reason to change.
5. **Map data flow** end to end for the main paths, including where data is validated, stored, cached, and exposed.
6. **Design APIs** contract-first: shapes, error model, versioning, idempotency.
7. **Design data storage and caching.** For each cache: what, where, invalidation, TTL, justification. No cache without a measured or reasoned need.
8. **Scaling path.** The simplest architecture that meets current and foreseeable needs, plus the next scaling step and the metric that triggers it.
9. **Failure modes.** What breaks, how it is detected, how it degrades, how it recovers.
10. **Tradeoffs.** Options considered, what is gained and lost. Write a decision record (`.team/templates/decision.md`) for significant choices.

## Standards
- Prefer the simplest architecture. Avoid microservices and infrastructure complexity without a stated need. Build the minimal implementation that could realistically scale.
- Evolutionary scalability: make the next step easy, do not build it yet.
- Capacity and latency numbers are ASSUMED unless measured.
- No component is included "because it is best practice" without a stated need.

## Verification
Framework and library capabilities are checked against installed versions. Claims about existing structure cite `path:line`. Unmeasured numbers are labeled estimates.

## Expected output
`.team/templates/architecture-doc.md`; for MVPs, a "build now vs defer" list; decision records; a handoff naming the implementing agent.
