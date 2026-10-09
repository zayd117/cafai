# Original design and interaction update

Latest owner instruction (2026-10-09): reject the draft visual redesign; restore the original BEFORE layout across desktop, mobile, results and setup. Add restrained interaction feedback and animation rather than redesigning the pages. Preserve the audited code fixes. Screenshots must be reviewed before any merge/deployment.

Original visual baseline: `33cacaafa9648bd11bc1acbcf33763c4b7778fcd`. Previous rejected draft: `b6980304ab8d1d743347cee4ab72b81056bc3e3e`. Original global CSS, shell/footer and intake composition have been restored. The five replacement style files are removed. The same native controls and field names remain; the intake uses the existing shared pending-submit component.

`feedback.css` owns only interaction states: 1px/2% pressed-button response, 180ms choice/disclosure feedback, and a restrained pending-request sheen. Reduced motion suppresses the new animations. `InteractionFeedback` is a single client boundary with no rendered markup: one 8ms vibration request for button/disclosure activation or checkbox/radio change, no vibration on page load, no listeners if the API is absent, and live reduced-motion preference suppresses pulses. It does not alter handlers, ranking, persistence or navigation.

Vibration requires supported browser/device hardware and user activation; it can do nothing on unsupported devices or silent/DND settings. [MDN reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). Automated Chromium uses a stub to verify call count and preference/unsupported behavior; physical haptic feel needs a supported phone and is not claimed as tested.

## Verification and review checkpoint

The user explicitly authorizes continuing unfinished implementation/testing without further input. Merge or deployment remains prohibited until they review fresh screenshots and explicitly approve. There is no supported credit-refresh event trigger; no automatic restart at that moment is promised.

Implementation is complete locally. TypeScript and production build passed. Own Chromium 153 passed 116 flow checks, 8 accessibility checks and 62 interaction checks. Six settled before/after captures (intake, results and setup at desktop 1440 and mobile 390) match pixel-for-pixel with reduced motion on both versions. Separate motion captures and API-call checks exercise the added feedback.

The first chip animation intercepted its checkbox; moving the animation to the whole native label fixed the click target. An initial disclosure fade briefly lowered text contrast; retaining full opacity fixed the axe finding while keeping the small movement. Both issues were corrected before review.

Current production source: 6,731 → 6,650 readable lines (1.20% fewer), 340,388 → 337,722 bytes (0.78% fewer). Persistence owners: 387 → 243 lines (37.21% fewer). Source including tests/scripts grows by 1.59% in lines; all CSS grows by 2.86% versus the original because interaction states are added. Runtime dependencies stay at nine. No isolated Ponytail effectiveness percentage is established.

Next: update the existing draft PR, run its native PostgreSQL CI on this exact revision, and deliver the screenshots, motion clip and measured review package. Review status remains pending. [PR #12 checks](https://github.com/zayd117/cafai/pull/12/checks) are the authoritative native PostgreSQL result; local browser preview uses PGlite and is not RLS proof.

Keep all code fixes from `b698030`: canonical persistence, DB security tests, redaction, direct rejection handling, typed catalog boundary, canonical useful-pick predicate and deployment smoke. Do not reintroduce the rejected visual layout. The earlier screenshot packages/reports are historical and superseded for the visual decision.
