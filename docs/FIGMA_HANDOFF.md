# Figma handoff

Living notes for turning the built UI into a Figma file later, and for checking a Figma design against the code.
Updated at every UI build chunk. Everything here describes what is **built and browser-verified**; unbuilt items are listed as such.

Sources of truth, in order: the user's words → Master Plan v3.1 → wireframe canvas "Caf.ai Wireframes v3.1"
(https://claude.ai/artifact/Ws1hft8GALEGne1L616Y4Y) → this code.

## 1. Screens

Screenshots are real renders from native Chromium (`npm run flow`), in `docs/figma-handoff/screens/`.
Desktop frames are 1440 wide, mobile frames 390 wide, full page height. All sample content is FIXTURE data in sample mode.

| # | Route | Wireframe board | Desktop | Mobile | State shown |
|---|---|---|---|---|---|
| 01 | `/` | 1 Counter, M1 | `01-counter-desktop.png` | `01-counter-mobile.png` | Empty counter |
| 02 | `/r/:runId` | 3 Picks, M3 | `02-results-desktop.png` | `02-results-mobile.png` | 3 direct picks + 1 "Also worth knowing", read-back collapsed |
| 03 | `/r/:runId` (one card) | 4 Card anatomy, M4 | `03-card-levels-desktop.png` | `03-card-levels-mobile.png` | Card with levels 2 and 3 open |
| 04 | `/r/:runId` | 3 Picks | `04-not-needed-desktop.png` | — | "Not needed now" open |
| 05 | `/r/:runId` | 6 States | `05-nothing-needed-desktop.png` | — | "You may not need anything new." |
| 06 | `/r/:runId` | 6 States | `06-out-of-scope-desktop.png` | — | Out of scope |
| 07 | `/r/:runId/setup?client=claude_code` | 7 Setup, M5 | `07-setup-claude-code-desktop.png` | `07-setup-claude-code-mobile.png` | Message copied, command, warnings |
| 08 | `/r/:runId/setup?client=cursor` | 7 Setup | `08-setup-cursor-desktop.png` | `08-setup-cursor-mobile.png` | Decoded install-link config |

Not built yet (no screenshot): streaming skeletons (board 2), saved project (8), settings (9), save prompt (10),
check-in email and page (11, 12), second door (13), low-confidence and clarifying-question states (drawn on board 6,
built in code but not screenshotted yet).

## 2. Design tokens

Defined once in `src/app/globals.css` (`:root`). In Figma, make one variable collection **Caf.ai / tokens** with these names.

### Color

| Token | Hex | Used for |
|---|---|---|
| `ground` | `#F6EDE1` | Page background |
| `paper` | `#FFFAF3` | Cards, inputs, panels |
| `ink` | `#2E1E16` | Text; checked chips and active tabs (fill) |
| `muted` | `#6B5344` | Secondary text, labels |
| `line` | `#E4D2BC` | Card borders, dashed dividers |
| `line-strong` | `#8A7262` | Input, chip and tag borders |
| `tag` | `#F0E2CF` | Placeholder chips, "Useful later" pill, danger note fill |
| `clay` | `#9A4A24` | Primary buttons, links, focus ring, danger note rule |
| `clay-dark` | `#7A3A1C` | Primary hover, link hover |
| `moss` | `#4E5E3A` | Match bar, Confidence dots, "Also worth knowing" border, "Needed now" text |
| `moss-soft` | `#E6EBDD` | "Needed now" pill fill |

### Type

Faces are self-hosted by `next/font/google`: **Young Serif** (display), **Figtree** (body), **Courier Prime** (mono).

| Style | Face | Size / line height | Weight | Where |
|---|---|---|---|---|
| Display XL | Young Serif | clamp(40–60px) / 1.15 | 400 | Counter heading |
| Display L | Young Serif | 34px / 1.15 | 400 | Section titles ("Barista's picks") |
| Display M | Young Serif | 26px / 1.15 | 400 | Card titles, setup section titles |
| Lede | Figtree | 22px / 1.5 | 400 | Counter subtitle |
| Body | Figtree | 16px / 1.5 | 400 | Default |
| Body strong | Figtree | 16px | 600–700 | Buttons, summaries |
| Small | Figtree | 14px / 1.5 | 400 | Help text, meta lines |
| Label caps | Figtree | 13px, +0.04em, uppercase | 700 | Card part labels ("WHY WE SHOWED IT") |
| Tag caps | Figtree | 12px, +0.06em, uppercase | 700 | SAMPLE / SHOULD HAVE tags |
| Mono | Courier Prime | 13–14px | 400/700 | Evidence tags, code blocks, "YOUR ORDER" |

### Shape and space

| Token | Value | Where |
|---|---|---|
| Border | 1.5px solid | Cards, inputs, chips, buttons |
| Radius pill | 999px | Buttons, chips, tabs, need pill |
| Radius XL | 24px | Counter box |
| Radius L | 20px | Cards, order panel, state panels |
| Radius M | 16px | Example buttons |
| Radius S | 12px | Inputs, banners |
| Radius XS | 6px | Tags, placeholders |
| Shadow | 0 10px 30px rgba(46,30,22,.08) | Counter box only |
| Gaps | 8, 12, 14, 16, 18, 22, 24, 32, 48 | Flex/grid gaps (auto layout spacing) |
| Page gutter | clamp(16px, 5vw, 72px) | Left/right page padding |
| Touch target | min 44px high | Every button, chip, tab, link in nav |

## 3. Components (map to Figma components with variants)

| Component | Code | Variants / states |
|---|---|---|
| Button | `.btn` | `primary` · default · `small` · `link` · `fit` (hug width); hover (primary darkens); focus ring 3px clay |
| Chip (toggle) | `.chip` (checkbox or radio + span) | unchecked (outline) · checked (ink fill, paper text) · focus |
| Text input / textarea | `.input`, `.textarea` | default · placeholder · focus · invalid (aria-invalid) |
| Tag | `.tag` | dashed outline, caps |
| Placeholder value | `.ph` | mono on `tag` fill, dashed border |
| Banner | `.banner` | sample (dashed) · `warn` (solid clay border) |
| Pick card | `PickCard` / `.card` | direct (solid `line` border) · also-worth-knowing (`.awk`, dashed moss border); level 2 and 3 closed/open |
| Match meter | `MatchMeter` | 4 segments; strong 4 · good 3 · possible 2 · weak 1 · skip 0; always with the word |
| Confidence dots | `ConfidenceDots` | 3 dots; Sure 3 · Fairly sure 2 · Not sure yet 1; always with the word |
| Need pill | `.need` | Needed now (moss-soft/moss) · Useful later (tag/ink) |
| Evidence tag | `.ev` | CLAIMED · OBSERVED · INFERRED (INFERRED text starts "We think:") |
| Disclosure level | `details.level` | closed · open (level 2 "How it fits and how to set it up", level 3 "Technical details") |
| Feedback row | `.feedback` | idle · acknowledged ("Thanks, noted.") |
| Order panel | `.order` | sticky on desktop; stacks at the bottom on mobile |
| Tabs | `.tab` | default · current (`aria-current="page"`) |
| Code block | `.code` | wraps long lines; scrolls sideways only inside itself |
| Danger note | `.danger` | "Check this:" prefix + clay left rule (never colour alone) |
| State panel | `.state` | nothing needed · no good pick · needs confirmation · needs clarification · out of scope · not found |

Rules the design must keep (plan §8, §9, §18): no MCP / OAuth / API / SDK / stdio words at card level 1; Match and
Confidence always shown as two separate indicators with words; score numbers only at level 3; never colour alone;
44px touch targets; text contrast 4.5:1 or better.

## 4. How to convert this into Figma

1. **Tokens.** In Figma, create the variable collection from section 2 (colors, numbers for radii/gaps, strings for font
   families). Create text styles from the type table.
2. **Components.** Build each component in section 3 with auto layout that mirrors the CSS: flex direction, `gap` as item
   spacing, padding as padding. Add the listed variants as component properties.
3. **Frames.** For each screen in section 1, make a 1440-wide and a 390-wide frame. Drop the matching screenshot in as a
   locked reference layer at 50% opacity, then rebuild on top of it with the components.
4. **Parity check.** After rebuilding, compare the Figma frame with the screenshot at 100%: spacing, wrapping, and the
   rules in section 3.
5. **With the Figma connector on in a session** (it is connected to the account but has been off in this session):
   send frame links ("Copy link to selection"). Claude can read them with the connector's design-context, screenshot and
   variable tools, diff them against these tokens and screenshots, and update `globals.css` and components to match.
   Whether the connector can write new frames into Figma is not verified; its listed tools are mostly read tools.
6. **Regenerate screenshots** after any UI change:
   ```
   CAFAI_CATALOG=fixture DATABASE_URL=postgres://cafai_app:<pw>@localhost:5432/cafai_dev npm run build && npm start -- -p 3100
   npm run flow -- http://localhost:3100 docs/figma-handoff/screens
   ```

## 5. Change log (UI)

| When (UTC) | Chunk | Change |
|---|---|---|
| 2026-09-30 08:55 | L6a | Counter, results page, card levels, outcomes, order and refine built and verified (27 checks) |
| 2026-09-30 09:00 | L6b | Setup page: tabs, paste message, decoded Cursor config, warnings, copy, It worked / Stuck (41 checks). Fixed: order listed the unticked extra idea; refine chips stacked; duplicate "Needed now" wording; Cursor pseudo-host shown as a connection; internal plan wording shown to users; full-width install button |
