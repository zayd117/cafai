# Original presentation and interaction feedback

The owner rejected the draft visual rebuild and asked to keep their BEFORE presentation across all screens. Original `globals.css` is restored byte-for-byte from `33cacaa`; the original intake markup and shell/footer are restored, with only the existing pending-submit component and a null-rendering haptic boundary added. The five replacement styling files are removed. Results/setup layouts, typography, original mobile wrapping, card styling and order panel are the originals again.

`feedback.css` owns interaction states only. Buttons depress by 1px/2% while pressed. Selected chips pulse for 180ms as a whole label, preserving the checkbox’s click target. Open native disclosures translate 4px over 180ms, keeping text fully opaque for contrast throughout. A pending action shows the existing working label, disables sibling submits and adds a subtle loading sheen. All new animations are absent under reduced motion, including live preference changes.

`InteractionFeedback` renders nothing and attaches one client event boundary for optional 8ms vibration requests on intentional button/disclosure activation or checkbox/radio change. It has no model/DB/navigation responsibility, no page-load vibration, and no listeners when the API is missing. It respects live reduced-motion preference. Existing handlers, focus, forms, copy feedback and live order updates remain native.

## Verification

Own Chromium 153 compares original and changed source with matching fixture/mock data at desktop 1440×1000 and mobile 390×844. All six settled intake/results/setup captures match the original pixels exactly with reduced motion enabled on both versions. Current check results are recorded in [the latest update](07-interaction-update.md) and screenshot package.

Existing flow tests exercise 116 journeys/checks; axe/keyboard covers 8 checks; the interaction suite covers 62 checks including six widths, unsupported haptics, one pulse per keyboard/pointer selection, no layout movement on press, native disclosures/focus, loading motion, live preferences, server redaction and no-JS forms. A click-target problem in the first chip animation and transient text-contrast loss in a fade were caught and corrected before review; the animation now belongs to the whole label and disclosures retain full opacity.

Physical haptic feel requires supported browser/device hardware and is not verified by desktop Chromium. [MDN vibration reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). No GSAP, Lenis or React Bits runtime is added; dependencies remain nine. The browser fixture tests do not prove live recommendation quality. No merge/deployment before screenshot review and explicit approval.
