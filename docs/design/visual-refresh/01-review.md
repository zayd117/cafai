# Structural review

The existing recommendation architecture has a useful boundary between interface, actions, engine, persistence and catalog. This change keeps that boundary. A visual redesign did not justify moving engine logic into components or rewriting scoring and validation.

The original 427-line global stylesheet mixed intake, shell, cards, tag editing, preview positioning, setup, mobile and forced-color rules. Splitting it into five owners reduces the largest stylesheet by 43.79%, while the import sequence preserves the shared cascade. This is ownership improvement, not deletion of the CSS moved into those files. The results owner still contains card and read-back rules because those components are tightly related; splitting every small selector would add navigation costs without demonstrated benefit.

The pending-state improvement reuses `SubmitButton`, already used in later pages. Four submit buttons now share that established contract instead of adding a separate form wrapper, action adapter or local pending state. Field names and native submissions remain intact.

An independent review using the saved Caf.ai skill and Thermo Nuclear criteria identified that the initial 29-line GSAP component and two dependencies were excessive for a 16px entrance. They were removed in favor of native CSS. The same review caught missing sentence spacing when a mobile media rule hides a line break; that was repaired before delivery.

Banner `.tag` styles now have a banner-specific owner, separating the marker from the existing editable tag cascade. Shared button transitions and disabled styles each have one canonical definition. Existing form, disclosure and keyboard behavior is retained, and the high-contrast checkbox styling now also applies to the redesigned intake.

Approval is conditional on visual review and verification. Passing fixture/browser checks does not establish live AI recommendation quality, human catalog curation or production readiness. The prior audit's deeper engine findings are neither repaired nor silently treated as resolved by this UI work.
