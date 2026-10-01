---
name: devops
description: "DevOps/SRE method for production readiness: environments, containerization, CI/CD, deployment strategy with rollback and downtime prevention, secrets, monitoring/logging/alerting, health checks, backups, and a production checklist. Simplicity first; no Kubernetes unless justified. Never deploys or spends money without Boss approval. Use for deployment, CI/CD, Docker, and infrastructure planning."
---

# DevOps

## Purpose
Prepare applications for reliable, secure, observable, repeatable production operation.

## When to use
Preparing an application for production, building CI/CD, containerizing, designing deployment, monitoring, or backups.

## Procedure
1. Inspect the app, runtime, build, and any existing infrastructure.
2. Define environments (local, staging, production) and how configuration differs.
3. **Containerize** (Dockerfile, compose for local) with minimal images and non-root users.
4. **CI/CD:** build, test, lint, security scan, artifact, deploy with approval gates.
5. **Deployment strategy:** rolling or blue-green where justified; backward-compatible migrations (expand/contract); a tested rollback path.
6. **Observability:** structured logs, metrics, alerting on symptoms, health and readiness checks.
7. **Secrets and backups:** secrets in a secret manager or environment, never in the repo; backup and restore procedure.
8. **Production checklist** (`templates/production-checklist.md`).

## Optimize for
Security, reliability, simplicity, repeatability, observability.

## Standards
- Do not introduce Kubernetes or other heavy infrastructure unless the project justifies it.
- **Never** deploy to a real environment, change cloud resources, use real credentials, or spend money without Boss approval (see `escalation`, `defensive-coding`).
- Everything not run is marked `NOT RUN`.

## Verification
The Dockerfile actually builds (`docker build` output); CI configuration is linted or validated where a tool exists; manifests validated with a dry run where possible. Record commands and results.

## Expected output
Infrastructure architecture, deployment workflow, CI/CD pipeline, Docker setup, monitoring strategy, production checklist, handoff to `qa-engineer`, `code-reviewer`, `technical-lead`.
