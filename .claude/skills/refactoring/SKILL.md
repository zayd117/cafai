---
name: refactoring
description: "Behavior-preserving refactoring method: understand current behavior, identify tests and dependencies, establish what must not change, write characterization tests when coverage is missing, refactor in small reversible steps, compare behavior, and document. Clean-architecture principles applied proportionally. Use for restructuring code, modularizing, reducing coupling or duplication."
---

# Refactoring

## Purpose
Improve structure without changing behavior, with proof.

## When to use
Improving structure (separation of concerns, modularity, cohesion, coupling, naming, testability) without changing behavior.

## Before refactoring
1. Understand current behavior (read the code, trace the main paths, cite `path:line`).
2. Identify the tests that cover it. Run them and record the baseline.
3. Identify dependencies and callers (search the codebase, including dynamic usage such as string lookups and config).
4. Establish the **"must not change" list** (public APIs, outputs, side effects, data formats).
5. If tests do not cover the behavior being changed, write **characterization tests** first (pin down what it does today, even if odd). Flag odd behavior to the Boss instead of "fixing" it silently.

## Procedure
1. Plan small, reversible steps. One kind of change per step (move, rename, extract, inline, split).
2. After each step run the tests. Commit-sized steps only if the Boss allowed commits.
3. Remove duplication, simplify complex logic, improve names, isolate I/O from domain logic.
4. Apply clean architecture **proportionally**: dependencies point inward, domain logic does not depend on frameworks or I/O, boundaries are explicit. Do not impose layers on a small application.

## After refactoring
Run tests, compare behavior (same outputs on the characterization cases), review the diff, document significant changes (decision record if architectural).

## Required deliverables
New folder structure; architecture breakdown; production-ready refactored code; key improvements (`.team/templates/refactor-plan.md`).

## Verification
Baseline vs final test results; "must not change" list checked item by item; diff reviewed for unintended changes.

## Expected output
Refactor plan, refactored code with passing tests, key improvements list, handoff to `qa-engineer` and `code-reviewer`.
