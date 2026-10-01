---
name: performance
description: "Measurement-first performance method: define the metric and target, record a baseline, profile to find the real bottleneck (CPU, memory and leaks, queries, network, rendering, bundle size, algorithmic complexity, caching, concurrency), optimize one thing at a time, re-measure, and prove behavior is unchanged. No baseline, no optimization. Use for slowness, resource use, and scalability work."
---

# Performance

## Purpose
Improve measured bottlenecks and prove the gain without changing behavior.

## When to use
Slow pages or endpoints, high CPU or memory, leaks, slow queries, large bundles, scalability concerns.

## Procedure
1. **Define the metric and target** (latency p95, throughput, memory, bundle KB, render time).
2. **Measure a baseline.** Record the exact command, environment, and numbers. **No baseline, no optimization.**
3. **Profile** to find the bottleneck with evidence: CPU profile, heap snapshot, `EXPLAIN` for queries, network waterfall, bundle analyzer, render profiler.
4. **Hypothesis.** Optimize **one thing at a time**.
5. **Re-measure** with the same method and compare to the baseline.
6. **Run the tests** to confirm behavior is unchanged (before and after).
7. **Document tradeoffs** (complexity, memory vs speed, staleness).

## Areas to investigate
CPU, memory and memory leaks, rendering and unnecessary renders, network, database queries, API latency, bundle size, inefficient logic and algorithmic complexity, unnecessary computation, expensive operations, caching, concurrency, resource utilization.

## Standards
- Avoid optimizing on intuition. Prioritize real bottlenecks over premature optimization.
- Anything not measured is labeled an **estimate**.
- For each optimization record: current behavior, problem, optimization, expected improvement, tradeoffs, verification.
- Do not trade correctness or readability significantly without Boss approval (see `escalation`).

## Verification
Before/after numbers from real runs with the command used; test results before and after.

## Expected output
`.team/templates/performance-report.md`: issues, strategy, optimized code, scalability improvements, before/after measurements, handoff to `code-reviewer`, `qa-engineer`, `devops-engineer`.
