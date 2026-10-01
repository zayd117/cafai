---
name: planning
description: "Technical Lead planning method: clarify requirements, classify the request into a development mode, break the objective into tasks with acceptance criteria and dependencies, choose specialists, write TASK files and a Technical Brief, and define verification gates. Use when scoping, planning, or decomposing any non-trivial request."
---

# Planning

## Purpose
Turn a Boss request into a clarified, classified, decomposed, verifiable plan.

Planning is a Technical Lead skill, not a separate agent.

## When to use
Any request bigger than a trivial one-step change, and always before coding on a new product or feature.

## Procedure
1. **Intake.** Restate the objective in one or two lines. List unknowns.
2. **Clarify.** Ask the Boss only the questions whose answers change the outcome. Everything else becomes a labeled ASSUMED item in the plan.
3. **Inspect.** Read the repo, `workspace/`, `decisions/`, `tasks/`, and open escalations (`workspace/escalations/`). Verify repo state by looking (branch, dependencies, test status), not from memory.
4. **Classify** into a development mode (BUILD, AUDIT, DEBUG, REFACTOR, SECURITY, PERFORMANCE, ARCHITECTURE, PIPELINE, FRONTEND, LEAD, DEVOPS; routing table in `CLAUDE.md`). A simple bug does not trigger a full-team process.
5. **Challenge.** Challenge weak technical decisions, including the Boss's, with evidence and respect. Think like a tech lead who must maintain and scale this for 5+ years. Prefer simplicity.
6. **Decompose.** Small tasks, each with one owner, acceptance criteria, and dependencies. Write them to `tasks/TASK-<NNN>.md` from `templates/task.md` (next number = highest existing plus one).
7. **Select specialists** using the delegation map in `agents/technical-lead`. Do not tell a specialist which skills to use; they select their own.
8. **Brief.** Write a Technical Brief to `workspace/plans/` before coding: key technical decisions, tradeoffs, recommended architecture, implementation plan, risks and ASSUMED items.
9. **Gates.** After each stage run the verification gate: handoff complete, claims tagged, evidence attached, at least 3 VERIFIED claims spot-checked.
10. **Delegate** with: scope, inputs, expected deliverables, the template to use, acceptance criteria.

## Standards
- Proportional engineering: do not overengineer small applications.
- Tasks are small enough to verify. Every task has testable acceptance criteria.
- Not every task needs every stage.
- Planning must not invent: dependencies, files, or capacity numbers are verified or labeled.

## Verification
Re-read the plan against the Boss's request: every requirement maps to a task; every task has an owner and acceptance criteria; no ASSUMED item on the critical path is left unsurfaced.

## Expected output
A Technical Brief in `workspace/plans/`, TASK files in `tasks/`, and a short plan summary (with open questions) to the Boss.
