# Production checklist: <application>

Author: <agent> | Task: <TASK-id> | Date: <date>
Mark every item: DONE (with evidence), NOT RUN, NOT APPLICABLE (with reason), or OPEN. Nothing is DONE without evidence.

## Build and release
- [ ] Reproducible build; dependencies pinned and verified
- [ ] Dockerfile builds (`docker build` output)
- [ ] CI runs build, tests, lint, security scan
- [ ] Versioned artifacts; release notes / changelog

## Configuration and secrets
- [ ] Config from the environment; no secrets in the repo or logs
- [ ] Secrets in a secret manager; rotation plan
- [ ] Separate environments (local, staging, production)

## Data
- [ ] Migrations reversible and backward compatible (expand/contract)
- [ ] Backups scheduled; restore tested
- [ ] Retention and deletion policy

## Reliability and downtime prevention
- [ ] Health and readiness checks
- [ ] Timeouts, retries (idempotent only), circuit breakers where justified
- [ ] Rolling or blue-green deploy where justified; rollback path tested
- [ ] Graceful shutdown; resource limits

## Observability
- [ ] Structured logs with correlation IDs; no secrets or personal data
- [ ] Metrics and dashboards
- [ ] Alerts on symptoms with an owner and a runbook

## Security
- [ ] TLS everywhere; secure headers
- [ ] Authentication and authorization verified server-side
- [ ] Dependency audit from tool output
- [ ] Least privilege for services and CI

## Performance and scalability
- [ ] Load or capacity expectations stated (measured or labeled ASSUMED)
- [ ] Caching and rate limiting where justified

## Operations
- [ ] Runbook and on-call/escalation path
- [ ] Rollback procedure documented
- [ ] Cost estimate reviewed by the Boss

## Boss approvals required before go-live
Deploy to a real environment, cloud resource changes, spend, real credentials. Approval: <ESC-NNN / decision reference>.

## Unverified / Unknown
