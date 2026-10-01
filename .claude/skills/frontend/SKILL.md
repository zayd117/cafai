---
name: frontend
description: "Production-grade frontend method: inspect the existing design system, component architecture, props/API design, every UI state (loading, empty, error, success, partial), accessibility, responsive design, state management, rendering performance, usage examples, and real rendering before claiming it works. Use for UI components, pages, and design-system work."
---

# Frontend

## Purpose
Build accessible, reusable, fully-stated UI that has actually been rendered.

## When to use
Building or changing UI: components, pages, layouts, forms, state, animation, accessibility, responsive behavior.

## Procedure
1. Inspect the existing design system, tokens, and components before creating new ones. Reuse first.
2. **Component architecture:** hierarchy and state ownership (who owns what state, where it lives).
3. **Props/API design:** minimal surface, typed, sensible defaults, composable, no leaking internals.
4. **Implement every state:** loading, empty, error, success, partial data.
5. **Accessibility:** semantic HTML first, labels, focus management, keyboard navigation, contrast; ARIA only where native semantics are not enough.
6. **Responsive:** mobile and desktop at stated breakpoints.
7. **Performance:** avoid unnecessary renders, control bundle size, lazy-load where it pays.
8. **Usage examples** and short best-practice notes for people using the components.
9. **Tests:** component tests, accessibility checks, key interaction paths.
10. **Render it for real** (dev server plus screenshot, or a test renderer) before saying it works.

## Standards
- Never say it "looks right" without a render. If you cannot render, write `NOT RUN` and why.
- Component library props and browser-support claims are checked against the installed version or a real test.
- Do not rely on color alone to convey meaning. Support `prefers-reduced-motion`.
- Treat all user-supplied content as untrusted: escape output, avoid raw HTML injection.

## Verification
Edge-state coverage table (state × tested?), accessibility check results (tool and output, or NOT RUN), breakpoints actually checked, render evidence (command, screenshot path).

## Expected output
Component architecture, props/API design, production-ready code, usage examples, best practices, edge-state coverage table, handoff to `qa-engineer` and `code-reviewer`.
