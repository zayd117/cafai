# Requirement traceability

Format: MD section → requirement → engineering task → files → test. Kind: **CONFIRMED** (explicit in plan), **NECESSARY** (needed to implement confirmed behavior, no product change), **PLACEHOLDER**.

## L0 Foundation

| Plan § | Requirement | Kind | Files | Test / verification |
|---|---|---|---|---|
| §17 | One TypeScript full-stack deployable (Next.js), Postgres, no extra services | CONFIRMED (stack approved A-004) | `package.json`, `tsconfig.json`, `next.config.ts` | `npm run typecheck`, `npm run build` |
| §17 Observability | Uptime check target | CONFIRMED | `src/app/api/health/route.ts` | `route.test.ts`; curl; Chromium |
| §18 | Server-rendered app, route `/` is the counter | CONFIRMED (route only; counter built in L5–L6) | `src/app/page.tsx` (PLACEHOLDER) | Chromium screenshot |
| §14 Secrets | Nothing in repo/client bundle; server-side only | CONFIRMED | `.gitignore`, `.env.example` | review |
| §14 Build pipeline | Lockfile committed | CONFIRMED | `package-lock.json` | review |
| §13 Sessions/cookies, §18 CSP | Security headers, strict CSP | CONFIRMED, **not yet built** | — | scheduled: L5 (shell) |
| §29 | Verify in real browser | process | `scripts/shot.mjs` | prints status, console errors, failed requests |
