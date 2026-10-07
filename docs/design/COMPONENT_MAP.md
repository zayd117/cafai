# Figma → code component map

Figma file: https://www.figma.com/design/1gCS6RVfLxkdP3AH95D4UY ("CAF.ai Design System")
Status as of 2026-09-30. **Nothing here is implemented.** This is a map for the future implementation step, which needs the user's go-ahead first.

"Today" column = what exists on branch `claude/agentic-fullstack-md-build-7mwvxz` (engineering session), inspected read-only. That branch is moving (several commits an hour), so re-check before implementing.

Legend: **BUILT** = drawn in Figma and visually checked. **SPEC'D** = specified below, not yet drawn (blocked, see `UX_DECISIONS.md` §1). Node IDs are for Figma MCP `get_design_context`.

## 1. Foundations

| Figma | Status | Expected code | Location | Today |
|---|---|---|---|---|
| Variable collections Primitives / Color / Spacing / Radius / Size / Typography (88 variables, web code syntax on each) | BUILT | CSS custom properties, names identical to the Figma code syntax | `docs/design/tokens.css` (proposal) → import at top of `src/app/globals.css` | Old tokens in `globals.css :root`: `--ground --paper --ink --muted --line --line-strong --tag --clay --clay-dark --moss --moss-soft` |
| 16 text styles | BUILT | `--type-*` / `--tracking-*` custom properties, used as `font: var(--type-body)` | `tokens.css` | Ad hoc `font-size` per class |
| Effect styles Shadow/sm, md, lg | BUILT | `--shadow-sm/md/lg` | `tokens.css` | One shadow on `.box` |
| Focus ring (a layer, 4px outside edge, 2px stroke) | BUILT | `:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px }` | `tokens.css` (rule included) | `outline: 3px solid var(--clay); outline-offset: 3px` |
| Fonts Instrument Sans, JetBrains Mono | BUILT | `next/font/google` with `variable: "--font-instrument-sans"` and `"--font-jetbrains-mono"` | `src/app/layout.tsx` | Young Serif, Figtree, Courier Prime |

### Old token → new token (for the eventual CSS swap)

| Old (`globals.css`) | New | Note |
|---|---|---|
| `--ground` #f6ede1 | `--color-bg-canvas` #F7F5F0 | greyer, less yellow |
| `--paper` #fffaf3 | `--color-bg-surface` #FFFFFF | |
| `--ink` #2e1e16 | `--color-text-primary` #1C1917 | |
| `--muted` #6b5344 | `--color-text-secondary` #57534E (long text) or `--color-text-muted` #6B655E (meta) | two steps instead of one |
| `--line` #e4d2bc | `--color-border-subtle` #E4E0D8 | |
| `--line-strong` #8a7262 | `--color-border-strong` #78716C | |
| `--tag` #f0e2cf | `--color-bg-sunken` #EFECE5 | |
| `--clay` #9a4a24 | `--color-bg-brand` / `--color-text-brand` / `--color-border-focus` #0F6B5C | brand changes clay → pine teal |
| `--clay-dark` #7a3a1c | `--color-bg-brand-hover` #0B5549 | |
| `--moss` #4e5e3a | `--color-fill-meter-on` (#0F6B5C) for the Match bar; `--color-border-accent` (#B7791F amber) for the "Also worth knowing" border | moss splits into two jobs |
| `--moss-soft` #e6ebdd | `--color-bg-brand-soft` #E2F0EC | |

## 2. Components

| Figma component (variant axes → props) | Node | Status | Expected code | Location | Today |
|---|---|---|---|---|---|
| **Icon/** check, chevron-down, chevron-right, copy, alert, external, cup, x | 5:14 … 5:59 | BUILT | `<Icon name="check" />`, inline SVG, `stroke="currentColor"`, 24px grid, 1.75 stroke | `src/app/_components/Icon.tsx` (new) | Header uses the brand mark (`public/brand/cafai-mark.svg`, UX_DECISIONS §10); chevrons are CSS |
| **Button** `Style=Primary\|Secondary\|Ghost`, `Size=Large\|Default\|Small`, `State=Default\|Hover\|Focus\|Disabled`; text prop `Label` | 5:122 (28 variants) | BUILT | Keep the class API: `.btn` + `.primary` / (secondary = default) / `.link` for Ghost; `.small`; new `.large` (56px, counter only). States are CSS `:hover`, `:focus-visible`, `:disabled`, not props | `globals.css` | `.btn`, `.btn.primary`, `.btn.small`, `.btn.link`, `.btn.fit`; pill radius, 48px |
| **Chip** `Selected=False\|True`, `State=Default\|Hover\|Focus\|Disabled`; text prop `Label` | 5:151 (8) | BUILT | Keep markup `label.chip > input[type=checkbox\|radio] + span`; `Selected=True` is `:checked + span`; check mark via `::before` (mask or inline SVG) | `globals.css` | `.chip` (checked = ink fill, no check mark) |
| **Tab** `State=Default\|Hover\|Current\|Focus`; text prop `Label` | 5:164 (4) | BUILT | `a.tab[aria-current="page"]` | `globals.css` | `.tab` (same markup) |
| **Field** `Kind=Input\|Textarea`, `State=Default\|Filled\|Focus\|Error\|Disabled`; text props `Label`, `Help`, `Error` | — | SPEC'D | `.field > label + .input\|.textarea + .help`; error = `aria-invalid="true"` + `role="alert"` line with alert icon | `globals.css` | `.field`, `.input`, `.textarea`; error only `aria-invalid` on the textarea, message is a `<p role="alert">` |
| **Banner** `Kind=Sample\|Notice\|Danger`; text prop `Message` | — | SPEC'D | `<Banner kind message />` | `src/app/_components/Banner.tsx` (new), replaces `ModeBanner` markup | `ModeBanner.tsx` + `.banner`, `.banner.warn` |
| **Danger note** text prop `Message` (icon + "CHECK THIS" label are part of the component) | — | SPEC'D | `<DangerNote>` | `_components/DangerNote.tsx` (new) | `<p className="danger">`, label via CSS `::before` |
| **State panel** props `Heading`, `Body`, `Show action` | — | SPEC'D | `<StatePanel heading body action />` | `_components/StatePanel.tsx` (new); used by `Outcome()` in `r/[runId]/page.tsx`, `not-found.tsx`, `error.tsx` | `section.state` repeated inline |
| **MatchMeter** `Band=Strong\|Good\|Possible\|Weak\|Skip` | — | SPEC'D | `<MatchMeter band />` (already a function in `PickCard.tsx`) | extract to `_components/MatchMeter.tsx` | inside `PickCard.tsx` |
| **ConfidenceDots** `Level=Sure\|Fairly sure\|Not sure yet` | — | SPEC'D | `<ConfidenceDots band />` | extract to `_components/ConfidenceDots.tsx` | inside `PickCard.tsx` |
| **NeedPill** `Kind=Needed now\|Useful later\|Probably not` | — | SPEC'D | `<span className="need [later\|no]">` | `globals.css` | `.need`, `.need.later` (no "probably not" style) |
| **EvidenceTag** `Kind=Claimed\|Observed\|Inferred` and **EvidenceLine** | — | SPEC'D | `<EvidenceLine fact />` | extract `FactLine` from `PickCard.tsx` | `FactLine` + `.ev` |
| **Disclosure** `Style=Row\|Card`, `State=Closed\|Open`; text prop `Title` | — | SPEC'D | native `<details><summary>` (keep: works without script, per the plan) | `globals.css` `.level`, `.notneeded` | same elements |
| **FeedbackRow** `Kind=Card\|Setup`, `State=Idle\|Thanked` | — | SPEC'D | `form.feedback` + `sendFeedback` (unchanged) | `globals.css` | `.feedback` |
| **CodeBlock** `State=Default\|Copied`; props `Label`, `Code` | — | SPEC'D | `<pre class="code">` + existing `CopyButton` | `globals.css`, `_components/CopyButton.tsx` | `.code`, `CopyButton.tsx` |
| **OrderPanel** `Device=Desktop\|Mobile` | — | SPEC'D | `aside.order` (sticky ≥ 960px, bar below) | `r/[runId]/page.tsx` + `globals.css` | `aside.order` |
| **ReadBack** `State=Collapsed\|Open\|Needs confirmation` | — | SPEC'D | `ReadBack()` (unchanged behaviour: `<details>`, editable items, one question, "Editing redoes the picks") | extract from `r/[runId]/page.tsx` to `_components/ReadBack.tsx` | function in the page file |
| **TopBar**, **Footer** | — | SPEC'D | `layout.tsx` header/footer | `layout.tsx` (or `_components/TopBar.tsx`, `Footer.tsx`) | inline in `layout.tsx` |
| **PickCard** `Kind=Direct\|AlsoWorthKnowing`, `Depth=Collapsed\|Level 2 open\|Levels 2+3 open`, booleans `Low-confidence note`, `Checked-trust note`; **PickCardRevoked** | — | SPEC'D | `PickCard` (behaviour unchanged: 12 parts, 3 levels, tick-to-add checkbox, feedback, alternatives) | `_components/PickCard.tsx` | exists |
| **Skeletons** (read-back, pick card) | — | SPEC'D | new; only when streaming is built | `_components/Skeleton.tsx` | not built (plan §18 streaming) |

## 3. Screens (all SPEC'D, none drawn yet)

| Screen | Route | Code | States to draw |
|---|---|---|---|
| Counter, desktop 1440 and mobile 390 | `/` | `src/app/page.tsx` | empty, filled, empty-input error, quota, paused |
| Read-back + picks, desktop and mobile | `/r/:runId` | `src/app/r/[runId]/page.tsx` | read-back collapsed, read-back open, needs confirmation, 3 direct + 1 also-worth-knowing, not-needed open |
| Outcomes | `/r/:runId` | same | nothing needed, no good pick, needs clarification, out of scope, degraded banner, revoked pick |
| Streaming | `/r/:runId` | not built | read-back then skeleton cards (plan §18, wireframe board 2) |
| Setup, desktop and mobile | `/r/:runId/setup` | `src/app/r/[runId]/setup/page.tsx` | Claude Code tab, Cursor tab (decoded config), nothing in order |
| Not found, error | `/r/:runId` 404, `error.tsx` | `not-found.tsx`, `error.tsx` | one state each |
| Legal placeholders | `/terms /privacy /security` | `LegalPlaceholder.tsx` | text only, no design work |

Not drawn because the plan puts them later or leaves them undecided (see the 21-item unknown list on the wireframe canvas): saved project `/p/:id`, settings, save prompt, check-in email and page, second door, offering page `/o/:id`, pricing, billing, category or browse pages (explicitly excluded by plan §5/§6).
