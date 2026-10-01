---
name: documentation
description: "Documentation method for architecture, APIs, setup, deployment, troubleshooting, technical decisions, and change history. Docs describe what the code actually does; every documented command is run and every path checked. Use when writing or updating docs, READMEs, decision records, or changelogs."
---

# Documentation

## Purpose
Keep documentation synchronized with what the code actually does.

## When to use
Writing or updating architecture docs, API docs, setup/deploy/troubleshooting guides, decision records, or changelogs. Documentation must stay synchronized with the implementation.

## Procedure
1. Read the code, handoffs, and decisions. Document the **actual implementation**, not the theoretical architecture.
2. Write only what the code does. Cite `path:line` where useful.
3. **Run every command** in setup and deployment docs and verify every path exists. Copy commands that actually succeeded.
4. Cross-link decision records (`.team/decisions/`).
5. Update the changelog.
6. Mark anything unverified as unverified in the docs themselves.

## Doc types
- Architecture: components, data flow, boundaries, tradeoffs.
- API: endpoints, request/response, errors, auth, examples from real calls.
- Setup and deployment: prerequisites, exact commands, expected output.
- Troubleshooting: symptom, cause, fix, how to verify.
- Decision records: `.team/templates/decision.md`, only for significant choices.
- Changelog: what changed, why, who is affected.

## Standards
- If docs and code conflict, report both. The code's behavior is the fact; intent is the Boss's call.
- Do not document behavior you did not observe. Do not leave TODOs or placeholders presented as finished docs.

## Verification
List of commands run (with results) and paths checked; list of statements marked unverified.

## Expected output
Updated docs in the repo, changelog entry, and a handoff to `technical-lead`.
