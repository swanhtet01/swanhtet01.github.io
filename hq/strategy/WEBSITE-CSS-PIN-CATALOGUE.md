# Website CSS pin catalogue (P3.1)

> **Execution record (2026-08-19): P3.3 and P3.4 have EXECUTED and are on
> main.** Sections 1-7 below are the historical analysis this execution was
> judged against — their line numbers are frozen at main @ 7965b621 (4,124
> lines; the file is 3,612 lines today). What happened, what deviated, and
> the post-deletion state are recorded in §8. Nothing in this catalogue
> authorizes deleting the surviving gen-one remainder (:1-1439) — see §8.

Authoritative disposition record for every `websiteCssSource` pin in
`tools/verify_app_build.mjs`, measured 2026-08-19 against main @ 7965b621
(branch `design/p3-1-website-pin-catalogue`). Verify line numbers are from
`tools/verify_app_build.mjs`; CSS line numbers are from
`showroom/src/products/website/website-product.css` (4,124 lines, LF-normalized —
the verifier normalizes CRLF at read time, so byte offsets below assume `\n`).
This batch is ANALYSIS ONLY: no source or verifier edits. P3.3 moves rules and
re-anchors; P3.4 deletes. Anything not in this table is not covered by the
website lane's safety argument — if P3.4 goes red, this file missed a pin; fix
here first, then re-run.

Method: byte-scan of the CSS for every pin expression (string `includes()`,
regex, and `indexOf`/`lastIndexOf` slice anchors), enclosing-selector
resolution via brace tracking, then liveness by grepping every class token
across all `showroom/src/**/*.{tsx,ts}` (dynamic class construction checked by
hand — see §2.1).

Regions (Binding Rule 6 + the in-file fence comment at :4100-4121):

| region | lines | notes |
|---|---|---|
| gen-one ("dead region") | :1-2145 | fenced from deletion until this catalogue; **contains live rules** (§5) |
| live | :2146-4124 | includes the phase-2 appendices; **contains dead rules** (§6) |

The plan's line numbers (scoped against 3aa567af) showed **zero drift**: :1512-1519,
:1924, :2140, :3225, :3295 all re-measured at the same lines on 7965b621.

`tools/test_theme_surface_contract.mjs` reads this same CSS (STYLESHEETS
:45-49) and exempts `.website-preview-frame` / `.website-preview-stage` /
`.website-preview-site` at :79-81. Its scanner sees every selector this lane
deletes; run it after every P3.3/P3.4 chunk.

## 1. Totals

**59 verify check sites** touch `websiteCssSource` or a slice derived from it,
carrying **65 unique pin expressions**:

| bucket | count | breakdown |
|---|---|---|
| positive string pins on `websiteCssSource` | 29 | 22 live-only, 3 both-region, 4 gen-one-only |
| negative (must-NOT-contain) string pins on `websiteCssSource` | 11 | all matchless today (vacuously green) |
| regex pins on `websiteCssSource` | 2 unique (3 sites) | 1 live-only, 1 gen-one-only |
| `embeddedWebsiteCss` slice pins (verify:2572, :2584-2586) | 3 strings + 1 anchor | all live |
| `websiteUnifiedCss` slice pins (verify:3805, :3849-3861) | 12 strings + 1 negative regex + 1 anchor | all live |
| `websiteMobileCss` slice pins (verify:3957-3959) | 2 strings + 1 negative regex + 2 anchors | slice is 100% gen-one bytes (§4) |

Classification verdict (the headline):

- **Zero pins anchor exclusively-dead CSS. There are no delete-with-pin rows.**
  Every positive pin expression matches at least one rule whose selector is
  rendered by TSX today.
- **5 expressions are gen-one-anchored** (all matches inside :1-2145):
  `max-width: 768px`, `max-width: 390px`, `.preview-site-header > i {`,
  `color: #0b6b3a;`, and the verify:3710 regex. All five pin **live** rules
  that merely sit inside the fence → disposition **re-anchor by move** (P3.3).
- **The whole `websiteMobileCss` slice is gen-one bytes** (:1924-2139) and its
  checks pass against **live** rules (`.website-preview-controls`,
  WebsiteProduct.tsx:1365) → the one place P3.3 MUST edit the verifier in
  lockstep (§4).
- Reconciliation vs the plan's counts: the plan said "37 unique string pins,
  5 dead-only, 4 both-region, 9 manual". Full enumeration finds **40** unique
  `includes()` strings on `websiteCssSource` (the verify:3822 must-not array
  contributes 7, likely the under-count), the plan's "5 dead-only" = my 4
  strings + the `@media (prefers-reduced-motion` slice **anchor**, and its
  "4 both-region" = my 3 strings + the `@media (max-width: 640px)` slice
  **anchor**. Same territory, cleaner bookkeeping here. The 9 "manual" pins
  are classified in §3.

Liveness citation shorthand used below: SP = SitePreview.tsx, WP =
WebsiteProduct.tsx, CW = ContentWorkspace.tsx, NW = NavigationWorkspace.tsx,
PW = PublishWorkspace.tsx, WSS = WebsiteStarterSetup.tsx, CS =
core/CoreShell.tsx. Dynamic classes: `'website-preview-frame is-' + device`
(SP:29) makes `is-desktop/is-tablet/is-mobile` live;
`'website-workspace-grid view-' + view` (WP:1305) makes
`view-content/view-publish` live; `` `core-shell theme-${theme}` `` (CS:446)
makes `.theme-dark` live.

## 2. The catalogue

One row per verify check site. "Occurrences" lists every match in
website-product.css with region g=gen-one (:1-2145) / L=live. Disposition
codes: **keep** = survives P3.3/P3.4 untouched; **re-anchor** = P3.3 moves the
pinned rule into the live region byte-identically (string pins are
position-independent, so the moved copy satisfies them; the verifier needs no
edit for these — see §7); **re-anchor+verify** = verifier edit mandatory in
the same PR.

### 2.1 Responsive preview bounds (verify:295-298) — the dimensional-bounds check

| verify | pin | occurrences | live/dead | disposition |
|---|---|---|---|---|
| :295 | `.website-preview-frame.is-tablet` | :1512 g (`.website-preview-frame.is-tablet`), :1716 g (`… .preview-hero`), :2034 g (device list in mobile block), :3105 L (device list in max-900 block) | LIVE — SP:29 renders `is-` + device; SP:50 `.preview-hero` | keep (live occurrence :3105 outlives P3.4) |
| :296 | `max-width: 768px` | :1514 g — ONLY match, inside :1512-1515 `.website-preview-frame.is-tablet` | LIVE (SP:29) | **re-anchor** — the pin dies with P3.4 unless :1512-1519 moves first (P3.3 minimum scope) |
| :297 | `.website-preview-frame.is-mobile` | :1517, :1720, :1725, :1729, :1733, :1737, :1742, :1746, :1750, :1756, :1760, :1764 g (the is-mobile preview restyle family), :2035 g, :3106 L | LIVE — SP:29; children all rendered: SP:31 header, SP:33 nav, SP:46 `<i>`, SP:50 hero, SP:71 section-grid, SP:88 footer | keep (:3106 survives), but the **behavioral** rules are gen-one-only → move with :1512-1519 |
| :298 | `max-width: 390px` | :1519 g — ONLY match, inside :1517-1520 `.website-preview-frame.is-mobile` | LIVE (SP:29) | **re-anchor** (same move as :296) |

Note: the surviving live matches (:3105-3106) are the responsive *collapse*
(`width: 100%`) — they keep the strings `includes()`-true but do NOT provide
the dimensional bounds. The check's intent lives only at :1512-1519.

### 2.2 Dark-secondary-button regression guard (verify:299)

| verify | pin | occurrences | disposition |
|---|---|---|---|
| :299 | must-NOT `padding: 0 12px;` + newline + `background: #ffffff;` | 0 (matchless) | keep — deletion can only keep it matchless; re-introduction is what it guards |

### 2.3 Today card + lead loop (verify:2295-2305, re-checked at :3594)

All matches are in the live region (:2367-2534 primary block, :4077-4082
type-floor appendix). Selectors rendered: `.website-today` WP:1107 (with
`data-state`), `.website-today-priority` WP:1108, `.website-today-metrics`
WP:1114, `.website-today-source` WP:1117, `.website-lead-inbox` WP:1276,
`.website-lead-capture-form` WP:1282, `.website-lead-list` WP:1292.

| verify | pin | occurrences | disposition |
|---|---|---|---|
| :2295, :3594 | `.website-today` | 25 L (:2367-2526, :4077-4080) | keep |
| :2296 | `.website-today-priority` | 6 L (:2383-2386, :2522, :4079) | keep |
| :2297 | `.website-today-metrics` | 8 L (:2388-2402, :2523-2524, :4077-4078) | keep |
| :2298 | `.website-today-source` | 6 L (:2404-2417, :2525-2526, :4080) | keep |
| :2299, :3879 | regex `\.website-today\s*\{\s*order:\s*1;` | 1 L (:2367) | keep — see §3 |
| :2300 | `.website-today { grid-template-columns: 1fr; padding: 13px; }` | 1 L (:2521, max-760 block) | keep — byte-exact one-liner; reformatting that line breaks the pin |
| :2301 | must-NOT `.website-operations-next` | 0 | keep |
| :2303 | `.website-lead-inbox` | 8 L (:2446-2472, :2528, :4079) | keep |
| :2304 | `.website-lead-capture-form` | 8 L (:2476-2505, :2530, :4082) | keep |
| :2305 | `.website-lead-list` | 14 L (:2507-2516, :2532-2534, :4081) | keep |

### 2.4 Shared-shell slice (verify:2572, :2584-2586 — `embeddedWebsiteCss`)

Slice anchor: `indexOf('/* Website runs inside the shared SuperMega shell. */')`
→ :3225, unique in file, live region. Slice = :3225-EOF.

| verify | pin | occurrences (within slice) | disposition |
|---|---|---|---|
| :2572 | slice anchor (comment) | :3225 L, unique | keep — unique comments are the robust anchor pattern (§4 recommends the same for the mobile slice) |
| :2584 | `.website-product {` | :3226, :3278, :4070, :4122 L | keep (WP:1068) |
| :2585 | `overflow: visible;` | :3281, :3501, :3512, :4090 L | keep |
| :2586 | `.website-shell {` + `\n    height: auto;` | :3284 L | keep (WP:1069); indentation-sensitive |

(Note: `.website-product {` also matches at :1 and :2147 in the full file, but
the slice starts at :3225, so gen-one deletion cannot starve this check.)

### 2.5 Preview a11y + hardware chrome (verify:3572-3573, :3710)

| verify | pin | occurrences | live/dead | disposition |
|---|---|---|---|---|
| :3572 | `.preview-site-header > i {` | :1583 g (base rule), :1729 g (superstring match inside `.website-preview-frame.is-mobile .preview-site-header > i {`) | LIVE — SP:31 renders the header, SP:46 renders `<i aria-hidden="true">MENU</i>`; :1584 hides it on desktop/tablet, :1729-1731 shows it on is-mobile | **re-anchor** — move :1583-1589 and :1729-1731 in P3.3 |
| :3573 | `color: #0b6b3a;` | :1585 g — ONLY match, inside `.preview-site-header > i` | LIVE (same rule) | **re-anchor**. NOTE: pinned hex literal. Preview-frame content is permanently exempt from tokenization (phase-2 item 12 ruling), so this stays a literal; move byte-identically |
| :3710 | regex `\.preview-hero > \.preview-cta\s*\{\s*min-height:\s*44px;` | :1627 g — ONLY match | LIVE — SP:50 hero, SP:55/60/65 render `.preview-cta` as button/a/span | **re-anchor** — the regex requires `min-height: 44px;` to stay the FIRST declaration of the block; byte-identical move preserves that |

### 2.6 Starter setup + notices + trial (verify:3640, :3643, :3741, :3836-3837)

| verify | pin | occurrences | disposition |
|---|---|---|---|
| :3640 | `.website-starter-actions {` + `\n  position: sticky;` | :3968 L (WSS:137) | keep |
| :3643 | must-NOT `.website-starter-errors` | 0 | keep |
| :3741 | `.website-notice-action` | 11 L (:2324, :2339, :3004, :3375, :3381, :3385, :3391, :3809, :3815 ×2, :4043 `.theme-dark …` — live via CS:446) | keep (WP:1077-1088) |
| :3836 | `.website-trial-ready-body` | :3633, :3803 L | keep (WP:115) |
| :3837 | `.website-trial-download` | :3734 L | keep (WP:138) |

### 2.7 Unified action-bar guard rails (verify:3822 must-NOT array)

All 7 matchless; the deleted-era selectors they ban live only in git history.
Disposition for all: keep.

`.website-workspace-nav`, `.website-mobile-mode-nav`, `.website-mobile-page-bar`,
`.website-mobile-site-settings`, `.website-surface-controls`,
`.website-split-control`, `[data-split=` — 0 occurrences each.

### 2.8 Unified slice (verify:3805, :3849-3861 — `websiteUnifiedCss`)

Slice anchor: `lastIndexOf('/* Unified Website workflow')` → :3295, unique,
live region; `lastIndexOf` is additionally robust to earlier insertions.
Slice = :3295-EOF. All pins below resolve inside it; all selectors rendered
(action bar WP:1126-1130 with `data-editing`/`data-starter`/`data-surface`;
heading WP:1097 with `data-view`; site-settings-content WP:1174;
primary-actions WP:1161; starter-identity-grid WSS:157). Disposition all rows:
**keep**.

| verify | pin | occurrences (slice) |
|---|---|---|
| :3805 | slice anchor comment | :3295, unique |
| :3849 | must-NOT regex (heading `p` display:none per data-view) | 0 — the :3784 block sets `display: block`, exactly what the guard wants |
| :3850 | `.website-heading[data-view="content"] p,\n  .website-heading[data-view="publish"] p {\n    display: block;` | :3784 (max-900 block) |
| :3851 | `.website-action-bar` | 14 (:3296-:4014) |
| :3852 | `grid-template-columns: minmax(280px, 1fr) auto auto` | :3302 |
| :3853 | `.website-site-settings-content` | 6 (:3468-:3855) |
| :3854 | `max-height: min(620px, calc(100svh - 170px))` | :3474 |
| :3855 | `@media screen and (max-width: 900px)` | :3739, :3981, :4055 |
| :3856 | `@media screen and (max-width: 560px)` | :3808, :4004 |
| :3857 | `grid-template-columns: repeat(3, minmax(0, 1fr))` | :3842, :3935 |
| :3858 | `.website-action-bar[data-surface="preview"] .website-primary-actions` | :3845 |
| :3859 | `grid-template-columns: repeat(2, minmax(0, 1fr))` | :3769, :3812, :3846, :3878, :4035 |
| :3860 | `.website-heading[data-view="content"]` | :3779, :3784 |
| :3861 | `display: none` | :3449 (`.website-site-settings > summary::-webkit-details-marker`) — ONLY in-slice match; deleting that one-liner breaks this pin |

### 2.9 Product-first layout + edit session + panel bounding (verify:3862-3910, :3960)

| verify | pin | occurrences | disposition |
|---|---|---|---|
| :3862 | `.website-action-bar {\n  order: 2;` | :3296 L | keep (WP:1126) |
| :3877 | must-NOT `.website-start-guide` | 0 | keep |
| :3878 | `.website-workspace-grid,\n.website-workspace-grid.view-publish {\n  order: 3;` | :2538 L | keep (WP:1305, `view-` + view) |
| :3880 | `.website-start-tools {\n  order: 4;\n  margin-top: 0;` | :3250 L | keep (WP:1273) |
| :3900 | `.website-save-state[data-state="unsaved"]` | :3353, :3358 L | keep (WP:1154-1156) |
| :3901 | `.website-action-bar[data-editing="true"]` | :3371, :3768 L | keep (WP:1127) |
| :3903 | `.website-workspace-grid[data-surface="work"] > .website-preview-surface` | :2577, :3022 L | keep (WP:1306, WP:1359) |
| :3904 | `.website-workspace-grid[data-surface="preview"] > .website-work-surface` | :2578, :3026 L | keep (WP:1310) |
| :3905 | `.website-workspace-grid[data-surface="preview"] > .website-preview-surface` | :3030 L | keep |
| :3906 | `display: none` | 32 matches, both regions — full table §2.10 | keep (19 live-region matches survive P3.4) |
| :3910 | `.website-editor-scroll[data-editor-section] > [data-content-section]` | :3201 L | keep (CW:62, CW:73) |
| :3960 | `.website-inline-actions > button,\n  .website-navigation-actions > button {\n    min-width: 44px;` | :3127 L (max-900 block) | keep (CW inline-actions, NW navigation-actions) |

### 2.10 `display: none` (verify:3906) — every occurrence

The one pin where occurrence-level liveness varies. 32 matches: 13 gen-one
(5 live-selector, 8 dead-selector), 19 live-region (14 live-selector, 5
dead-selector). The pin itself can never be starved by P3.4 (19 live-region
matches), so occurrence classification here feeds the P3.4 delete list, not
the pin's survival.

| line | region | enclosing selector | verdict | evidence |
|---|---|---|---|---|
| :405 | g | `.website-mobile-pane-controls` | DEAD | class in no TSX (0 hits across showroom/src) |
| :763 | g | `.website-disclosure > summary::-webkit-details-marker` | **LIVE — load-bearing** | CW:264 renders `.website-disclosure`; NO live-region equivalent exists (live :2744/:2749 style summary/::before but never ::-webkit-details-marker) → must MOVE in P3.3, not delete |
| :1584 | g | `.preview-site-header > i` | LIVE | SP:46 (§2.5) |
| :1726 | g | `.website-preview-frame.is-mobile .preview-site-header > nav` | LIVE | SP:29 + SP:33 |
| :1854 | g | `.website-page-index > header` (max-900) | DEAD | 0 TSX hits |
| :1871 | g | `.website-sidebar-foot` (max-900) | DEAD | 0 TSX hits |
| :1901 | g | `.website-workspace-grid.mobile-pane-edit > .website-preview-panel` | DEAD | `mobile-pane-*` modifier rendered nowhere (surface switching is `data-surface`, WP:1306) |
| :1905 | g | `.website-workspace-grid.mobile-pane-preview > :not(.website-preview-panel)` | DEAD | same |
| :1925 | g | `.website-business-controls > summary b` (mobile block) | LIVE | WP:1273-1274 render `<b>{leadCounts.new} new</b>` in the summary |
| :1949 | g | `.website-brand > i, .website-brand > b, .website-runtime > small` | DEAD | neither class in any TSX |
| :1966 | g | `.website-site-record` | DEAD | 0 TSX hits |
| :2015 | g | `.website-main.mobile-pane-edit .website-preview-controls` | DEAD | `mobile-pane-edit` never applied |
| :2118 | g | `.website-publish-history code` | LIVE | PW:571 history div, PW:587 `<code>File unavailable</code>` |
| :2254 | L | `.website-product-label, .website-runtime-label-short` | DEAD | 0 TSX hits |
| :2436 | L | `.website-business-controls > summary::-webkit-details-marker` | LIVE | WP:1273 |
| :2527 | L | `.website-business-controls:not([open]) > summary small` | LIVE | WP:1274 |
| :2579 | L | `[data-surface] cross-hiding pair` (:2577-2580) | LIVE | WP:1306 |
| :2669 | L | `.website-eyebrow::before` | LIVE | CW:53 etc. |
| :2750 | L | `.website-disclosure > summary::before` | LIVE | CW:264 |
| :2884 | L | `.website-window-dots, .website-preview-toolbar > span` | LIVE | SP:19-20 |
| :2952 | L | `.website-site-summary > small, .website-runtime > small` (max-900) | DEAD | 0 TSX hits |
| :2956 | L | `.website-brand > b` (max-900) | DEAD | 0 TSX hits |
| :2970 | L | `.website-site-label, .website-runtime-label` (max-900) | DEAD | 0 TSX hits |
| :3009 | L | `.website-notice[data-priority="routine"]` (max-900) | LIVE | WP:1072 sets `data-priority` |
| :3023 | L | `[data-surface="work"] > .website-preview-surface` (max-900) | LIVE | WP:1306/1359 |
| :3027 | L | `[data-surface="preview"] > .website-work-surface` (max-900) | LIVE | WP:1310 |
| :3056 | L | `.view-content … > .website-panel-head` (max-900) | LIVE | WP:1305, CW:51 |
| :3060 | L | `.view-content .website-panel-actions > div:first-child` (max-900) | LIVE | CW:309 |
| :3140 | L | `.website-brand > b` (max-640 block :3138) | DEAD | 0 TSX hits |
| :3202 | L | `.website-editor-scroll[data-editor-section] > [data-content-section]` | LIVE | CW:62/73 |
| :3269 | L | `.website-start-tools > summary::-webkit-details-marker` | LIVE | WP:1273 |
| :3449 | L | `.website-site-settings > summary::-webkit-details-marker` | LIVE | WP:1164/1174 — sole :3861 match (§2.8) |

## 3. The nine "manual" pins, classified definitively

The plan's string scan could not resolve escaped/regex pins. Verdicts:

| # | verify | pin | verdict |
|---|---|---|---|
| 1 | :299 | must-NOT escaped 2-line string | matchless; live-safe; keep (§2.2) |
| 2 | :2299 = :3879 | regex `.website-today {\s*order: 1;` | LIVE-only, :2367; keep (§2.3) |
| 3 | :3710 | regex `.preview-hero > .preview-cta {\s*min-height: 44px;` | **gen-one-anchored, live rule** — the 5th dead-region pin alongside :296/:298/:3572/:3573; re-anchor by move (§2.5) |
| 4 | :3640 | `.website-starter-actions {` sticky 2-liner | LIVE-only, :3968; keep |
| 5 | :3862 | `.website-action-bar {` order-2 2-liner | LIVE-only, :3296; keep |
| 6 | :3878 | workspace-grid order-3 3-liner | LIVE-only, :2538; keep |
| 7 | :3880 | start-tools order-4 3-liner | LIVE-only, :3250; keep |
| 8 | :3960 | inline/navigation 44px 3-liner | LIVE-only, :3127; keep |
| 9 | :3958 | must-NOT regex, unconditional `.website-preview-controls { display: none` in the mobile slice | matchless — the slice's only preview-controls hide (:2014) is prefixed `.website-main.mobile-pane-edit`, which the `(?:^|\n)\s*` guard correctly does not match; that rule is dead anyway (§2.10 :2015). Keep, but see §4 |

All escaped multi-line pins are **byte- and indentation-exact**: any
reformatting of :2521, :2538, :3126-3129, :3250-3252, :3296-3297, :3968-3969
(or the moved copies P3.3 creates) breaks them. P3.9's geometry-by-attrition
edits must not touch whitespace inside these spans.

## 4. The `websiteMobileCss` slice — boundaries and safe re-anchor

Current mechanics (verify:3957):

    websiteCssSource.slice(
      indexOf('@media (max-width: 640px)'),     // FIRST of 4: :1924 g, :3138 L, :3212 L, :4088 L
      indexOf('@media (prefers-reduced-motion')  // ONLY match: :2140 g
    )

→ slice = **:1924-2139, entirely gen-one bytes**. The checks at :3958-3959
(`.website-preview-controls` present, `display: flex` present, never hidden
unconditionally) are satisfied by :2008-2012, a **live** rule
(WP:1365 renders `.website-preview-controls`). So the mobile-review-controls
guarantee is real today — it just lives inside the fence.

Rule-by-rule disposition of the slice (:1924-2139), for P3.3's move list:

| lines | selector | verdict | evidence |
|---|---|---|---|
| :1925 | `.website-business-controls > summary b` | LIVE | WP:1274 |
| :1926 | `.website-business-controls > summary span` | LIVE | WP:1274 |
| :1927-1930 | `.website-topbar` | DEAD | 0 TSX hits |
| :1931-1940 | `.website-brand, .website-button, …, .website-preview-controls > button, .website-inline-actions > button, .website-navigation-actions > button` | MIXED — split on move | `.website-brand` dead; the button members live (CW:311+, WP:1365, CW inline, NW navigation) |
| :1941-1945 | `.website-product input…, select` | LIVE | WP:1068 |
| :1946-1951 | `.website-brand > i/b, .website-runtime > small` | DEAD | 0 TSX hits |
| :1952-1955 | `.website-local-badge` | DEAD | 0 TSX hits |
| :1956-1964 | `.website-sidebar` | DEAD | 0 TSX hits |
| :1965-1968 | `.website-site-record` | DEAD | 0 TSX hits |
| :1969-1984 | `.website-page-index` family (3 rules) | DEAD | 0 TSX hits |
| :1985-1997 | `.website-heading`, `.website-heading p` | LIVE | WP:1097 |
| :1998-2007 | `.website-mobile-pane-controls` (+ `> button`) | DEAD | 0 TSX hits |
| :2008-2012 | `.website-preview-controls` | **LIVE — the :3958-3959 payload** | WP:1365 |
| :2014-2016 | `.website-main.mobile-pane-edit .website-preview-controls` | DEAD | modifier never applied |
| :2018-2021 | `.website-preview-controls > span` | LIVE | WP renders span in controls group |
| :2022-2026 | `.website-preview-controls > button` | LIVE | WP:1366+ |
| :2027-2032 | `.website-editor-panel, .website-preview-panel` | LIVE | CW:50, SP:18 |
| :2033-2038 | `.website-preview-frame.is-*` (collapse) | LIVE | SP:29 |
| :2039-2042 | `.website-panel-head` | LIVE | CW:51 |
| :2043-2057 | `.website-form-grid.two-columns, .website-check-list, .website-evidence-form` (+2 nth rules) | LIVE | CW:75+, PW check-list/evidence |
| :2058-2066 | `.website-navigation-row`, `.website-navigation-actions` | LIVE | NW |
| :2067-2070 | `.website-evidence-form .website-button` | LIVE | PW |
| :2071-2075 | `.website-local-publish-action` | LIVE | PW |
| :2076-2112 | `.website-handoff-action` / `.website-handoff-controls` family (7 rules) | DEAD | 0 TSX hits |
| :2113-2120 | `.website-publish-history > article`, `… code` | LIVE | PW:571, PW:587 |
| :2121-2134 | `.website-panel-actions` family (3 rules) | LIVE | CW:309 |
| :2135-2139 | `.website-notice` | LIVE | WP:1072 |

**Safe re-anchor (P3.3, verifier edit mandatory — the ONE lockstep site):**

1. Move the LIVE rows above into a new live-region block
   `@media (max-width: 640px) { … }` introduced by a **unique comment marker**
   (e.g. `/* Mobile review controls — verify slice start */`), byte-identical
   rule bodies.
2. The end anchor `@media (prefers-reduced-motion` exists ONLY at :2140
   (gen-one). The live region has **no reduced-motion block at all** — itself
   a gap: the `.website-preview-frame` transition suppression (:2140-2144)
   is a live a11y rule that must move too. Re-create it AFTER the new mobile
   block; it can serve as the end anchor again, or better:
3. Re-point verify:3957 at two unique comment markers instead of generic
   at-rule strings. Generic `indexOf` anchors are the fragility that produced
   this whole situation: 4 `max-width: 640px` matches today, and if P3.4 ran
   without re-anchoring, `indexOf('@media (prefers-reduced-motion')` returns
   **-1**, silently turning the slice into `slice(:3138, len-1)` — checks
   would then pass/fail against unrelated bytes instead of erroring. The
   :2572 comment-anchor pattern is the house style; copy it.
4. Until step 1-3 land together, ANY edit inside :1924-2145 shifts the slice.
   P3.2's EOF-append discipline keeps it safe; nothing else touches the fence.

## 5. Live rules inside the "dead" region (must MOVE in P3.3, never delete)

Minimum move list (union of §2 and §4 findings): :1512-1519 (preview-frame
bounds), :1583-1589 + :1729-1731 (preview MENU glyph), :1627 block
(preview-cta 44px), :1716-1727 + :1733-1767 (is-tablet/is-mobile preview
restyle — live via SP), **:762-764 (the ONLY `.website-disclosure`
::-webkit-details-marker hider — no live-region duplicate)**, the LIVE rows
of the :1924-2139 mobile block (§4), :2140-2144 (reduced-motion), and the
gen-one base rules for still-rendered classes OUTSIDE any pin (e.g.
`.website-preview-controls` :464-500, `.website-disclosure` :741-790 — the
live region restyles these at :2612+/:2744+ but P3.4's chunk review must
diff-check which gen-one declarations have no live-region successor before
deleting). The P3.1 pin catalogue covers every VERIFIER exposure; the
rule-by-rule sweep of unpinned gen-one rules happens per-chunk in P3.4 with
the theme contract as backstop.

## 6. Dead rules inside the LIVE region (bonus finds for a later cleanup)

Not pinned by anything; safe to delete in any P3.4 chunk (or P3.9 attrition):
:2254 (`.website-product-label, .website-runtime-label-short`), :2947-2971
members `.website-site-summary > small`/`.website-runtime > small` (:2952),
`.website-brand > b` (:2956), `.website-site-label, .website-runtime-label`
(:2970), and in the :3138 max-640 block: `.website-brand > b` (:3139-3141),
`.website-local-badge` (:3142+). All 0 TSX hits.

## 7. Correction to the plan's re-anchor model (surprise worth recording)

The plan assumed P3.3 must "re-point the five dead-only pins … in
verify_app_build.mjs at the new locations". Measured reality: all five are
`includes()`/regex **content** pins — position-independent. A byte-identical
move satisfies them with ZERO verifier edits; only the `websiteMobileCss`
slice anchors (verify:3957) encode position and REQUIRE the lockstep edit.
This shrinks P3.3's verifier diff to one site (plus optional comment-marker
modernization per §4.3) and makes P3.4's safety argument purely: "every
pinned string still has a live-region match" — which §2 shows is already true
for everything except the five §2.5/§2.1 movers and the slice.

## 8. Execution record (added 2026-08-19, after P3.4 merged to main)

The catalogue's predictions were executed and held:

- **P3.3 shipped** (#468, `7f87d0ab`): the §5 minimum move list re-homed as
  true MOVES (byte-identical rule bodies) at the head of the live region —
  moves, not DESIGN-PROGRAM's copy-in-place model, so the P3.0 hex ratchet
  stayed at 60 (a copy would have duplicated `#0b6b3a` and the preview-frame
  literals). §7 confirmed in practice: zero verifier edits for the five
  gen-one-anchored content pins; the one mandatory lockstep edit re-anchored
  the `websiteMobileCss` slice on two unique comment markers
  (`/* Mobile review controls -- verify slice start (P3.3) */` /
  `... end (P3.3) */`, today at CSS :1573/:1694) — exactly the §4.3
  recommendation.
- **P3.4 shipped** as two FAMILY-contiguous chunks (`0633f757` workspace
  chrome, including the §6 live-region companions; `134a6be4` handoff family
  plus the emptied gen-one max-640 block) and a close-out (`1be73e86`) — net
  625 source lines deleted, zero pin reds. The §7 safety argument was the
  test, and it passed. Family-contiguous instead of the plan's
  region-contiguous chunking: the theme surface contract fails a chunk that
  deletes a family's `.theme-dark` override while any of its light surfaces
  survives elsewhere.
- **The hex ratchet did NOT drop.** The dead rules carried rgba()/var()
  only; DESIGN-PROGRAM's "52 gen-one hex vanish with P3.4" expectation was
  wrong — those literals sit in the surviving gen-one base rules.

Post-deletion state (re-measured 2026-08-19 against main @ `ed7a78ca`; the
file is 3,612 lines):

- **The gen-one remainder is :1-1439** (the P3.3 banner at :1440 opens the
  live region; the Rule 6 fence comment now sits at :3539). A fresh scan of
  every class token in :1-1439 against `showroom/src/**/*.{tsx,ts}`
  (dynamic `is-`/`view-`/`theme-` construction included) finds 85 tokens,
  81 with TSX consumers. The 4 zero-consumer tokens all ride MIXED selector
  lists beside live members: `.website-brand`/`.website-runtime` (:95, with
  live `.website-preview-controls` and others), `.website-local-badge`
  (:104 and :122, with live `.website-status`), `.website-sidebar-foot >
  span` (:137, with live `.website-boundary-note > span` and others) — plus
  the live-region riders `.website-brand > span` (:1745) and
  `.website-local-badge` (:1753). Removing a rider is a consolidation edit
  to a live rule (P3.9 attrition), NOT dead-rule deletion.
- **Known dead strays in the live region** (under-enumerated by §6, left by
  chunk 2; for a later consolidation batch, not this lane): standalone rules
  `.website-handoff-controls label` (:2336-2338) and
  `.website-handoff-controls input` (:2340-2342) — zero TSX consumers, no
  surviving `.theme-dark` family member, unpinned — and the mixed-list
  riders `.website-handoff-action strong` (:2243) / `.website-handoff-action
  p` (:2259). Deleting the standalone pair shifts every in-file line-number
  audit ref below :2336; renumber those refs in the same commit (house rule
  since chunk 2).
- **The website lane's dead-code deletion is COMPLETE.** §5's warning now
  describes the whole remainder: :1-1439 holds only live-consumed base rules
  (whose live-region successors win by cascade) and the mixed lists above.
  Retiring any of it is P3.9 attrition/consolidation work with per-
  declaration diff-review — there are no delete-a-region moves left.
