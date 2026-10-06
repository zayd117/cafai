# Design and UX decisions

Owner: the design session. Product truth is Master Plan v3.1; the visual truth is the Figma file; this repo is what is implemented. Nothing in `docs/design/` changes the app.

Figma file: https://www.figma.com/design/1gCS6RVfLxkdP3AH95D4UY

## 1. Status and blocker

Built and visually checked in Figma: foundations page (88 variables in 6 collections, 16 text styles, 4 effect styles, specimens), 8 icons, Button (28 variants), Chip (8), Tab (4).

**Blocked:** the Figma account is a Starter plan with a View seat. Figma's documented limit for that seat is **20 MCP tool calls per month** (`file://figma/docs/rate-limits-access.md`), and all 20 are used. Options, fastest first:

1. Give the account a Full or Dev seat on a paid plan (Professional: 200 calls/day, 10/min).
2. Wait for the monthly counter to reset (whether it is calendar or rolling is not stated in the doc).
3. Continue the remaining screens in another tool (for example the claude.ai design canvas used for the v3.1 wireframes). This loses the variable bindings and Dev Mode code syntax that make the Figma file directly usable for implementation.

The file also inherits Starter limits: **3 pages** (so Foundations, Components, Screens) and **1 mode per variable collection** (so no dark theme; the plan defines none anyway).

Remaining Figma queue, in order: Field, Banner, Danger note, State panel, MatchMeter, ConfidenceDots, NeedPill, EvidenceTag/Line, Disclosure, FeedbackRow, CodeBlock, OrderPanel, ReadBack, TopBar, Footer, PickCard (+ revoked), skeletons; then screens at 1440 and 390 (see `COMPONENT_MAP.md` §3). The call that was rejected for quota did not run, so no partial state is expected; verify when access returns.

## 2. Direction: what changed and why

Brief from the user: a visual departure that improves UI and UX, since Figma had not been used before. The information architecture does **not** change: it comes from the plan and is already built (12-part card on 3 levels, read-back, order, setup).

| Area | Was (built from wireframes) | Now (drawn in Figma) | Why |
|---|---|---|---|
| Palette | Cream `#F6EDE1`, clay `#9A4A24`, moss `#4E5E3A` | Warm-grey paper `#F7F5F0`, white surfaces, one pine-teal brand `#0F6B5C`, amber for "worth knowing", red for "check this" | Less yellow cast, one brand colour instead of clay + moss, amber gives the speculative pick its own meaning |
| Type | Young Serif / Figtree / Courier Prime | Instrument Sans throughout, JetBrains Mono for labels, tags and commands | Sans-led reads as a tool for people who work in Claude Code and Cursor; mono keeps the menu-board flavour; two families instead of three |
| Shape | 1.5px borders, pill buttons, 20–24px card radius | 1px hairlines, 12px button radius, 16px cards, pills kept for chips and pills | Calmer surfaces; buttons and chips look like different controls |
| Spacing | Gaps of 14, 18, 22px | 4-point scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96) | One scale to implement; old 14/18/22 snap to 12/16/24 |
| Focus | 3px clay outline, 3px offset | 2px brand ring, 2px gap | Same visibility, tighter; one `:focus-visible` rule |
| Selected chip | Ink fill, no mark | Soft brand fill, brand border, check mark | Plan §18: never colour alone |
| Touch targets | min 44px | 44 (small), 48 (default), 56 (counter submit) | Plan §18 |

Contrast, measured with the WCAG 2.x formula on the exact hex values (shown on the Foundations page): body text on canvas 16.1:1, secondary 7.0:1, muted 5.3:1, white on brand 6.4:1, brand-soft pair 8.7:1, amber pair 7.4:1, danger pair 7.5:1, input border on surface 4.8:1 (non-text needs 3:1). Other pairs were not measured.

## 3. Plan rules the design must keep (checked against §5, §8, §9, §18)

- Level 1 of a card has no "MCP", "OAuth", "API", "SDK", "stdio". Technical facts sit at level 3.
- Match and Confidence are two separate indicators, each with words (Strong/Good/Possible/Weak/Skip and Sure/Fairly sure/Not sure yet). Score numbers appear only at level 3, and their weights are still open (register A-009), so no numbers are drawn.
- Meaning never rests on colour alone; 44px targets; 4.5:1 text contrast; visible focus.
- No category grid, no browse, no trending wall, no paid placement, no pricing page. The plan says Caf.ai is not a marketplace, so the user's "marketplace" wording was not followed literally.
- Nothing is installed by Caf.ai; setup is a handoff. Third-party text is never rendered as HTML.
- Sample and mock content is labelled, never shown as real.

## 4. Proposals not yet drawn (need the user's approval before drawing or implementing)

Each is a design opinion, not a plan requirement.

| Proposal | Type of change | Reason |
|---|---|---|
| Promote the Match and Confidence indicators to directly under the card's summary, each with a small caps label | Markup reorder in `PickCard.tsx` | Fit is comparable across cards at a glance; today it sits after "Do you need it?" |
| Show "Set up in / Effort / Access" as three labelled items instead of one grey sentence | Markup in `PickCard.tsx` | Scannable; effort and access wording is still catalog data (wireframe unknown #4) |
| Style the order panel as a receipt (mono caps heading, dashed perforation) | CSS plus small markup | Keeps the coffee-shop idea without a cosy palette |
| Example prompts fill the text box instead of submitting immediately | **Behaviour change** (needs client script; today each example is a submit button) | Lets people edit an example; the plan says only "example prompts" |
| Give "Probably not" its own need-pill style | CSS | Today only "Needed now" and "Useful later" are styled |

## 5. Decision on code collision (the user delegated this)

The engineering session commits to `src/app/**` (including `globals.css`, `PickCard.tsx`, `layout.tsx`) continuously: eight files under `src/app` changed between two of this session's reads, 09:07 and 09:17 UTC on 2026-09-30. Therefore:

- Now: design output lives only in new files under `docs/design/` on `claude/festive-goodall-y4u5vf`. No overlap with any engineering file.
- Later, once the user approves: implement in this order, on a branch cut from the engineering branch's latest head, touching only presentational files: (1) import `tokens.css` and swap fonts in `layout.tsx`, (2) re-map old variables to new in `globals.css`, (3) extract and restyle components from `COMPONENT_MAP.md`, one commit each. Coordinate with the engineering session before starting, because steps 2 and 3 edit files it also edits.
- Never touched: engine, db, server, catalog, scripts, migrations, config, actions, proxy (CSP), package.json.

## 6. Carried-over unknowns that affect design

The 21 items on the wireframe canvas note "UNKNOWN / NEEDS CONFIRMATION" still stand (project-type chip values, effort and access wording, reasons for "not useful", copy for expired/quota/outage states, retention, sign-in for returning users, and so on). Copy for those states is drawn as placeholder wording and flagged, never as final.

## 7. Page redesign after the intake (2026-10-06)

The user asked to redesign every page except the intake using four named sources: TasteSkill (redesign audit and AI-tell rules), Vercel's web interface guidelines (audit), awesome-design-md (reference: its Intercom file, chosen because it shares the warm canvas, white hairline cards and single accent), and Playwright CLI (before and after screenshots at 1440 and 390). Information architecture, routes, form field names and the labels `scripts/flow.mjs` checks are unchanged.

| Area | Was | Now | Why |
|---|---|---|---|
| Labels | Mono, uppercase, tracked (`WHY WE SHOWED IT`, `YOUR ORDER`) | Sentence case, sans, 13px/600 | Reference and TasteSkill both reject all-caps eyebrows; one type voice |
| Order panel | Receipt (mono caps heading, dashed perforation) | Plain panel; list follows the card ticks live; numbers match the card ranks | The receipt read as decoration; the stale list was a bug |
| Results layout | Read-back above the h1; outcome under an open edit form; empty aside column on outcomes | h1 first; outcome is the h1 when there are no picks; single centred column without picks | The answer comes first |
| Disclosures | Bare bold lines, no affordance | Chevron that turns; extra details grouped in one panel | Vercel: visible state for collapsibles |
| Setup | Mono paste block, red boxes for routine advice, run-on message lines | Readable message (one line per step), amber "Check this" list per tool, segmented tool picker, feedback keeps the chosen tab and picks | Beginners read the message; red stays for real problems (revoked, unreadable link) |
| Dates, states | ISO dates; no pending state | `Intl` dates; "Updating…" while a rerun runs | Vercel rules |

Deliberate deviations: sentence case everywhere (Vercel suggests Title Case); radii stay 16 for cards and 12 for controls (the reference uses 12 and 8) to match the intake; the "Also worth knowing" card keeps its amber dashed border because the token set assigns amber to it; no dark theme (plan defines none).

Audit follow-up (same day): a review against the same four sources plus a pixel diff of the intake found that global rules
from this redesign (`text-wrap: pretty`, button press and icon rules, a shorter footer gap) had changed the intake on phones.
They now apply only to the pages after the intake, and the intake is pixel-identical to the live version again. Other fixes:
ticking nothing sets up nothing (the order form sends `order=1`); the order panel is sticky only beside the cards; "Yes,
that's right" sits in the form it submits so it gets the busy state; ticks survive the reload after card feedback (per tab);
feedback thanks take focus so screen readers read them; tab titles name the outcome or "Order not found"; the chosen setup
tab has a strong outline and the tabs wrap on phones; high-contrast mode keeps chevrons, meters and ticks visible; and
`Referrer-Policy: same-origin` (was `no-referrer`, which made browsers send `Origin: null`, so every form failed without
JavaScript).
