---
name: engineering-standards
description: "Baseline engineering standards for any agent that writes or reviews code: follow project conventions, keep code readable and cohesive, reuse before writing, validate input, handle errors, verify dependencies, run tests, and review the diff. Load before writing or reviewing code."
---

# Engineering standards

## Purpose
Keep all code consistent, readable, minimal, and verified.

## When to use
Any task that writes or reviews code. Load `defensive-coding` alongside it when you write code, config, or infrastructure.

## Procedure
1. Inspect the surrounding code, conventions, and tests before modifying anything.
2. Understand dependencies and who calls the code before changing shared behavior.
3. Reuse before you write: search for an existing implementation first.
4. Make the change in small steps.
5. Run the relevant tests and linters after each meaningful step.
6. Review the resulting diff (`git diff`) before reporting.

## Standards
- Follow existing project conventions (naming, layout, error style, test style).
- Prefer readable code over clever code. Keep functions focused and modules cohesive. Minimize coupling.
- Avoid unnecessary abstraction. Avoid duplicated business logic.
- Validate external input. Handle errors explicitly (see `defensive-coding`).
- Every dependency you add must be verified to exist (exact name and version) and justified. Prefer none.
- Claims about your own work follow the Truth-First protocol (see `anti-hallucination`).
- Never assume code works because it compiles. Run it.
- Do not overengineer: proportional engineering for the size of the problem.

## Verification
Record the build/test/lint commands you ran and their results. Say `NOT RUN` for anything you could not run, with the reason.

## Expected output
A minimal, reviewed diff that matches project conventions, with tests, and a handoff that cites evidence.
