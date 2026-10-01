---
name: security
description: "Evidence-based application security review: authentication, authorization, injection, XSS, CSRF, SSRF, secrets, data exposure, file handling, dependencies, API abuse, infrastructure. Findings rated by severity and exploitability with attack scenarios and verified secure fixes; no invented vulnerabilities. Use for security reviews, threat modeling, and secure-fix verification."
---

# Security

## Purpose
Find and verify real vulnerabilities and fix them without breaking behavior.

## When to use
Security audits, reviewing auth or data-handling code, dependency checks, validating a fix, or checking security smells during code review.

## Procedure
1. **Scope and brief threat model:** assets, entry points, trust boundaries, attacker types.
2. **Inspect each category:** authentication, authorization, sessions, injection (SQL, command, template), XSS, CSRF, SSRF, secrets, sensitive data exposure, file handling and uploads, dependencies, API abuse (rate limits, enumeration, mass assignment), infrastructure and configuration.
3. **Validate every finding.** Try to demonstrate it against a local or explicitly authorized target, or label it POTENTIAL.
4. **Rate** each finding.
5. **Attack scenario:** a realistic path from attacker to impact.
6. **Secure fix:** a robust implementation that does not break existing behavior.
7. **Verify the fix** (test or demonstration; original behavior preserved).
8. **Production-grade recommendations** (headers, rate limiting, secret management, logging, dependency policy).

## Rating
- Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO.
- Exploitability: VERIFIED (demonstrated), PLAUSIBLE (path exists, not demonstrated), THEORETICAL.
- Evidence: `path:line`, request/response, or test output.

## Standards
- Do not invent vulnerabilities. Findings without proof are labeled POTENTIAL, never VERIFIED.
- Dependency vulnerabilities come from audit-tool output (for example `npm audit`), never from memory.
- **Safety:** test only local or explicitly authorized targets. Never exploit third-party systems. Never use real credentials.
- If you find a live secret: report where, never print its value, and escalate (see `escalation`).
- Prioritize exploitable risks over theoretical ones.

## Verification
Per finding: evidence, exploitability level, fix verification command and result. List what was **not** inspected.

## Expected output
`.team/templates/security-report.md`: per finding the vulnerability, severity, affected component, attack path, impact, remediation, verification; plus production recommendations.
