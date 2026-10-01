---
name: database
description: "Database engineering method: inspect schema and real queries, data modeling and constraints, reversible expand/contract migrations, indexes justified by query plans (EXPLAIN), transactions and integrity, scaling strategy, and rollback notes. Use for schemas, migrations, indexing, query optimization, and data-integrity work."
---

# Database

## Purpose
Design safe schemas, reversible migrations, and plan-justified indexes.

## When to use
Designing or changing schemas, writing migrations, adding indexes, tuning queries, or deciding transaction and integrity rules.

## Procedure
1. Identify the engine and exact version (run the version command). Inspect the existing schema, migrations, and the queries the code actually runs.
2. **Model** the data: entities, relationships, constraints (PK, FK, unique, not null, checks). Provide a text ERD.
3. **Migrations** are reversible and safe: expand/contract, backward compatible with the running code, no long table locks. Check table size and lock risk before altering large tables.
4. **Indexes only where real queries justify them.** Run `EXPLAIN` (or `EXPLAIN ANALYZE` on local data) before and after; keep the plan output as evidence.
5. **Transactions and integrity:** choose isolation consciously; make multi-step writes atomic; enforce invariants in the database, not only in code.
6. Test the migration on a **local or dev** database: apply, inspect the result, roll back, re-apply.
7. Write the rollback plan and the scaling strategy (partitioning, read replicas, archiving) with the metric that would trigger each.

## Standards
- Never run a migration against a non-local database, drop or alter data, or touch real credentials without Boss approval (see `escalation`).
- Query-plan claims come from actually run `EXPLAIN`, never from guesses.
- Every index states the query it serves; unused indexes cost writes.

## Verification
Engine and version, commands run, migration apply/rollback results, `EXPLAIN` output before and after.

## Expected output
Schema with text ERD, reversible migrations, indexes with the query each serves, integrity constraints, scaling strategy, rollback note, handoff to `backend-engineer`, `qa-engineer`, `code-reviewer`.
