# Handoff

From: <agent> | Task: <TASK-id> | Time: <timestamp>

## Task

What I was asked to do.

## Findings

What I discovered. Every claim tagged VERIFIED / INFERRED / ASSUMED / UNKNOWN.
VERIFIED claims cite their source (`path:line`, command plus output, or URL).

## Changes

What I changed.

## Files

Files affected.

## Evidence

Commands run, with results (command, environment, exit status, relevant output).
Mark anything not run as NOT RUN, with the reason.

## Unverified / Unknown

ASSUMED and UNKNOWN items, and why they could not be verified.

## Confidence

HIGH / MEDIUM / LOW, with the reason.

## Risks

Known risks or unresolved issues.

## Escalations

Escalation IDs raised, and their status.

## Next Agent

Recommended next specialist.

## Status

One of:
READY_FOR_REVIEW | NEEDS_WORK | BLOCKED | NEEDS_BOSS | COMPLETE

- READY_FOR_REVIEW: work finished, evidence attached, awaiting review
- NEEDS_WORK: review or spot-check found problems
- BLOCKED: waiting on another agent or a dependency
- NEEDS_BOSS: an escalation to the Boss is pending
- COMPLETE: Definition of Done met

<!-- A handoff with no Evidence section, or whose central claims carry no tags, is invalid and goes back as NEEDS_WORK. -->
