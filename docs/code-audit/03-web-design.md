# Web and responsive design review

## Integrating the owner's desktop and mobile preferences

The intake uses one introduction and one project form. At widths 761px and above, CSS restores the original desktop composition: centered black Instrument Sans headline, centered tagline and steps, wide rounded composer, inline AI choices, pill submit, green/amber background glow and centered examples.

At widths 760px and below, it keeps the preferred mobile version: green accent in the headline, short explanatory introduction, compact steps, stacked composer controls, large touch targets and a full-width submit. The mobile-only introductory copy hides on desktop. No duplicate form/action state or separate device-specific page was introduced. An unused decorative signoff was removed.

Existing results and setup improvements from the prior visual pass are retained: clearer selected-card feedback and order-panel hierarchy. Existing copy feedback, live selection/order updates and FoundOn previews predate this pass and are not presented as new functionality.

## Motion and request feedback

The previous draft's shared submit component remains: active requests display a pending label and disable the primary/example submits through form status. A brief native entrance uses opacity/16px translation; content starts visible, focus is unchanged, transforms clear after completion, and reduced-motion settings remove the effect, including changes after page load.

No smooth-scroll interception or animation framework is required. GSAP, Lenis and React Bits guidance was considered but no runtime package/component was added. This preserves native scroll, anchors, forms, sticky summaries and the existing CSP.

## Browser evidence

Own Chromium 153.0.8010.0 captured original commit `33cacaafa9648bd11bc1acbcf33763c4b7778fcd` and the changed source with the same fixture/mock data and viewports: desktop 1440×1000 and mobile 390×844. Both versions passed 116 existing flow checks and 8 accessibility checks.

The changed source also passed 48 design/behavior checks:

- Six viewport widths: 320, 390, 760, 761, 1024, 1440; no horizontal overflow, visible textarea, at least 44px submit target and one project form.
- Mobile introduction and original desktop centered composition/text color on the appropriate side of the breakpoint.
- Reduced motion, completion cleanup, focus preservation and live preference changes.
- Four disabled submit controls while a POST is held; screenshot captures the pending state.
- No uncaught/CSP console errors.
- A crafted read-back post demonstrates server redaction and saved edited output.
- Native project and saved-example submission with JavaScript disabled.

The captures show sample-mode disclosure. No visual performance claim is based on screenshots. Automated axe/keyboard checks do not replace Safari or a full assistive-technology review.

All source CSS is 560 → 605 lines (+8.04%), including tokens and imports. Splitting the former monolithic CSS was ownership restructuring, not a claim of CSS deletion. The responsive adaptation has a real styling cost and is included in the overall production totals.
