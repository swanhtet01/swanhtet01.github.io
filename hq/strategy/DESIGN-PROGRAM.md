# Design program — tribunal verdict and phased redesign queue

Status: phase 1 SHIPPED (PR #431, 2026-08-18). Phase 2 items 1-11 and 13
SHIPPED (batches 0-8 on main, 2026-08-19). Item 12 ("narrow ecommerce
tokenization") SHIPPED on `claude/supermega-dev-ceo-aije17` (PR #452):
fixed the dead `--website-quiet` token (a same-specificity cascade
collision this doc's own review had misdiagnosed once already — see
`DESIGN-REVIEW-2026-08-18.md`) and tokenized the 2 Ecommerce surfaces that
were genuinely safe to move (page-header text, the workspace-switch
`<select>`s). The other ~100+ hex literals in `ecommerce-product.css` are
deliberately exempt — preview-frame content, or the cockpit/buying-workspace
family a prior flip attempt regressed 25→201 failures on — and stay as-is;
do not re-attempt converting them without re-reading that history first.
All 13 phase-2 items are now closed. This document is the agent-facing
source of truth for the remaining design work; any agent (Claude, Codex, or
other) picking up a design item executes from here.
Origin: a 6-audit, 3-judge design tribunal (2026-08-18) benchmarking all four
products against Square POS, Loyverse, Odoo MRP/Katana, Shopify, and Wix,
judged through Polaris-coherence, accessibility, and emerging-market-adoption
lenses.

## Verdict (grades vs world-class)

design-system C- · shop-plant UX C- · website-ecommerce UX C- ·
accessibility B- · mobile B- · first-impression C+ · **overall C** —
"A-grade engineering hygiene carrying a pre-system visual foundation …
dressed as an engineer's console rather than a product a Yangon shop owner
would pay for."

## Binding rules for ALL future UI work

1. **No new hex/px literal where a token exists.** Ramps live in
   `showroom/src/core/core-app.css` `:root`: `--font-size-xs/sm/base/md/lg/
   xl/display/price`, `--font-weight-medium/semibold/bold/black`,
   `--radius-sm/md/lg/pill`, `--space-1..6`, `--shadow-1..3`,
   `--core-on-accent`, `--core-field-line`, `--core-scroll-accent`.
2. Text on the accent uses `--core-on-accent`; never `--core-ink` on
   `--core-green`.
3. `tools/verify_app_build.mjs` pins exact source strings (including CSS
   selectors/values and media-query regions): prefer EOF-appended overrides
   and value-level edits; pinned originals stay byte-identical.
4. Every `:root` token is mirrored in `.theme-dark`. Un-exempting a surface
   requires deleting its THEME_BLIND entry in
   `tools/test_theme_surface_contract.mjs` (its staleness check enforces this).
5. Myanmar script: system Burmese faces ride the font stacks; `:lang(my)`
   line-height ≥ 1.6; display headings that render user data are floored at
   1.3 — never regress these.
6. Judges' standing overrules — do NOT resurrect: self-hosted Geist woff2
   (3G cost), big-bang geometry sweeps, immediate deletion of the ~2,100
   dead generation-one lines in `website-product.css` (fenced; delete only in
   phase 3 after pin cataloguing — **condition satisfied and EXECUTED**:
   P3.1 catalogued every pin (#464), P3.3 re-homed the live movers (#468),
   P3.4 deleted the catalogued-dead remainder (`0633f757`, `134a6be4`,
   close-out `1be73e86`). The fence still stands over what survives: the
   gen-one remainder at :1-1439 is live base rules plus mixed selector
   lists, NOT dead code — retire it only via P3.9 attrition/consolidation,
   never as a deletion sweep; execution record in
   `WEBSITE-CSS-PIN-CATALOGUE.md` §8), a full icon language.

Shipped work has been reviewed: `DESIGN-REVIEW-2026-08-18.md`. Read it before
taking another phase-2 item — two findings change what the next item should be
(phase 1's website tokenization is inert behind a duplicate `.website-product`
block, and the shipped cart sticky bar does not stick at ≤840px).

## Phase 2 queue (PR-sized; execute in order unless the founder redirects)

1. **One-tap cash sale** — CoreApp.tsx `reviewCounterSale`/`queueAction`
   (~3293-3371): add a "Paid and handed over" toggle to the counter
   AccountableActionGate, default ON for the Walk-in channel; one `apply()`
   chains the existing `reserveCommerceOrder` + `reconcileCommercePayment` +
   `advanceCommerceOrder` mutations to completed under one commandId/proof
   (all three exist in commerce-workspace.ts — do not modify them). Keep the
   multi-step pipeline for pay-later and delivery. Today a cash sale is 5
   modals across 2 tabs; Loyverse does 3 taps. This is the adoption event.
2. **De-brand merchant surfaces** — delete the `>_` spans at
   EcommerceProduct.tsx:2177/:2221, SitePreview.tsx:32, ContentWorkspace.tsx:258;
   restyle via appended CSS. Keep `>_` in SuperMega's own chrome (favicon pin
   verify:465).
3. **Persistent cart money total** — EcommerceBuyingWorkspace.tsx:1215 badge
   becomes "{n} items · {formatMmk(cartTotal)}" (cartTotal exists at :1234);
   sticky summary bar from tokens.
4. **Daily close out of the accordion** — CoreApp.tsx orders tab 6362-6390
   into a top-level "Close the day" section; keep the `#shop-close-controls`
   anchor (deep links at 5931, 1126).
5. **Status-pill traffic-light semantics** — `--core-danger` is never used by
   any pill; late/cancelled/due-soon remap in OrderList (CoreApp.tsx:6690-6695).
6. **EN/MY operator verbs** — ~50-entry {en,my} table for hot paths only
   (tabs, counter, order actions, gates, close); render "EN · MY" pairs per
   SettingsPage.tsx:1983; ship with lang="my" tagging + dynamic lang in
   ReceiptDialog (detector exists at website-export.ts:195).
7. **Zero-flash theme restore** — inline script in showroom/index.html head
   reading `supermega-interface-theme` (CoreShell writes the dataset at :408
   but no CSS reads it; meta theme-color hardwired at index.html:15).
8. **PWA raster icons** — icon-192/512/maskable into showroom/public-app/,
   appended as icons[1..3] (verify:473 checks icons[0] === '/favicon.svg').
9. **Weight normalization** — 650/680→600, 720-780→700, 800-850→800 onto the
   ramp tokens (the 13-weight hierarchy collapses to Roboto Black on
   static-font Androids). Grep verify pins per declaration; batch by file.
10. **Theme-toggle SVG** — replace U+263C/U+25D0 at CoreShell.tsx:427/430 with
    inline SVGs (currentColor) + aria-label.
11. **Login/signup error pattern** — replicate WebsiteStarterSetup.tsx:167-228
    (aria-invalid, aria-describedby, role=alert, visible "Error:" prefix) into
    ManagedLoginPage.tsx:137-152 and SignupPage.tsx:227.
12. **Narrow ecommerce tokenization** — ~10 root surfaces onto core tokens
    (byte-identical light), matching .theme-dark remaps, delete the covered
    THEME_BLIND entries. Preview-frame exemptions stay permanently.
13. **Primary-button normalization** — one spec (44px min-height, radius-md,
    13-14px, bold, green/on-accent) across .core-button.primary,
    .website-button.is-primary, .storefront-request-button; raise
    .core-button.compact 36→44px.

## Phase 3 (structural; needs its own planning pass each)

Full ecommerce literal retirement (129 hex → tokens + color-mix cockpit
tints); ~~bottom-nav work modes~~ **Shop slice SHIPPED 2026-08-19**
(`claude/supermega-dev-ceo-aije17`, commits `40ef87ee` + `ba60c931`): Shop's
mobile bar carries Today/Sell/Orders/Stock + a Products door via the shared
`commerce-tabs.ts` module; pinned 2-column `.mobile-nav` CSS untouched
(EOF-appended 5-column override); active state comes from `?tab=` (Link, not
NavLink — pathname-only isActive would light all tabs); the Products door is
verifier-pinned because it is the ONLY ≤840px path to `/?choose=1`. Plant's
2-tab slice is the natural follow-up once wanted — the mechanism is built.
Keyboard verification was by static analysis (no browser in the build
sandbox); the on-device pass was CLOSED by P3.7 batch 1 (2026-08-20 — see
the P3.7 SHIPPED note below for the browser evidence). Remaining phase-3 items:
selling-surface IA (ops consoles behind an Operations
area; plain-language lead lines added BEFORE pinned compliance litanies);
Plant UX pass (parked until Plant enters the sales path); geometry
convergence by attrition; px→rem for OS font scaling + a stylelint check
failing CI on consumed-but-undefined properties and new hex literals (must be
wired into app:verify or it never runs).

The loose list above is now scoped: execute from the phase-3 execution plan
below. (The verify:1072 mobile-nav reference above has drifted; the pinned
markup contract now lives at verify:1085-1100 — see P3.7.)

## Phase 3 execution plan (scoped 2026-08-19 against main @ 3aa567af)

Every count below was measured on current source, not carried forward from
the tribunal. Line numbers are main @ 3aa567af; re-verify them before
editing — this file's own history shows drift (the phase-3 list's
"verify:1072" is already :1085-1100).

Measured baselines (occurrences, not lines):

| file | hex | px |
|---|---|---|
| showroom/src/core/core-app.css | 104 | 3,053 |
| showroom/src/products/ecommerce/ecommerce-product.css | 129 (112 in live declarations, 17 in comments) | 449 |
| showroom/src/products/website/website-product.css | 82 (52 in the gen-one region :1-2145, 30 live) | 954 (497 gen-one, 457 live) |
| showroom/src/products/website/publish-workspace.css | 1 | 237 |

Standing judge rules restated, with current status:

- **No big-bang sweeps.** Every batch below is a single-PR unit that leaves
  the app shippable.
- **Deletion only after pin cataloguing.** P3.1 IS the catalogue; P3.4 is
  the only batch that deletes, and it depends on P3.1-P3.3.
- **One-tap-sale gates bottom-nav.** The gate is SATISFIED: 'Paid & handed
  over' shipped in PR #436 (CoreApp.tsx:6799 renders the settle button,
  :3900 writes the one-review summary). P3.7 is unblocked.
- Plant UX pass stays PARKED (Plant is not in the sales path). Not scoped
  here; re-open its planning pass when that changes.

Ordering DAG (independent lanes may run in parallel; nothing inside a lane
may reorder):

    P3.0 (ratchet check)  ── before any CSS-touching batch lands after it
    P3.1 → P3.2 → P3.3 → P3.4          (website lane)
    P3.5a → P3.5b → P3.5c → P3.5d      (ecommerce lane, independent)
    P3.0 → P3.6a → P3.6b → P3.6c       (px→rem lane; needs the ratchet first)
    P3.7, P3.8                          (TSX-side, independent of CSS lanes)
    P3.9                                (standing rule, never its own PR)

### P3.0 — CSS contract check (build the ratchet first)

**What the phase-3 list called "a stylelint check".** Do NOT add stylelint.
Evidence: no stylelint dependency or config exists anywhere
(showroom/package.json devDependencies: eslint family, postcss,
autoprefixer only; root package.json has none). The repo convention for
exactly this kind of check is a hand-rolled .mjs verifier —
tools/test_theme_surface_contract.mjs already parses these same CSS files
with its own scanner and enforces a THEME_BLIND staleness contract. A
stylelint install buys a dependency, a config dialect, and a plugin
(stylelint-value-no-unknown-custom-properties) to express two rules a
50-line script states directly. Build `tools/check_css_contracts.mjs`:

1. **Consumed-but-undefined custom properties.** Current violation count
   across the four CSS files: exactly ONE — `var(--core-border,
   rgba(127,127,127,0.35))` at core-app.css:1208, consumed nowhere-defined
   but carrying a fallback. Decide the semantics in the PR: fail on
   fallback-less consumption only (then :1208 passes and the rule is green
   from day one), and separately fix :1208 to `--core-line` or define
   `--core-border`. Fallback-less is the right severity: the shadow-ramp
   and --website-quiet incidents were both *silent* dead tokens.
2. **Hex-literal ratchet.** Per-file baseline = the table above; fail if a
   file's count EXCEEDS its recorded baseline; lower the baseline
   automatically (write the new floor) whenever a batch retires literals.
   A ratchet, not a ban — attrition tightens it, and it never demands a
   sweep. Two required carve-outs, both live today: hex inside `var()`
   fallbacks (website-product.css:4123 `var(--core-quiet, #5f6f67)` is the
   item-12 repair) and hex inside comments (17 of ecommerce's 129 are
   documentation, e.g. :21, :77, :198-199).

**Wiring (or it never runs):** CI's only entry is showroom-ci.yml:133 →
`npm run app:build:checked` → `npm run app:verify`. Append the step to the
app:verify chain in root package.json (637 steps today → 638; the
"~637 steps" expectation in verify recipes moves with it).
tools/run_app_verify.mjs derives its step list from that same chain string,
so no runner change is needed.

**Pins to lockstep:** none — new file, one package.json chain edit.
**Estimate:** 1 PR, half a day including the baseline-file format decision.

### P3.1 — Website pin catalogue (prerequisite for the whole website lane)

The gen-one region is website-product.css **:1-2145** (fenced by Binding
Rule 6 and the in-file comment at :4100-4121; file total 4,124 lines).
Measured pin exposure in tools/verify_app_build.mjs (37 unique string pins
against websiteCssSource + 3 slice anchors + regex pins):

- **5 pins resolve ONLY inside the gen-one region**: `max-width: 768px`,
  `max-width: 390px` (verify:295-298,
  website_responsive_preview_not_dimensionally_bounded),
  `.preview-site-header > i {`, `color: #0b6b3a;` (verify:3572-3573),
  `@media (prefers-reduced-motion` (slice marker, see next).
- **The websiteMobileCss slice is entirely dead-anchored**: verify:3957
  slices from the FIRST `@media (max-width: 640px)` (:1924, gen-one) to
  `@media (prefers-reduced-motion` (:2140, gen-one only) — so the
  mobile-review-controls checks at verify:3958-3959 are validated against
  gen-one bytes, lines 1924-2139.
- **4 pins occur in both regions** (`.website-preview-frame.is-tablet`,
  `.is-mobile`, `display: none`, `@media (max-width: 640px)`) — safe to
  includes() but their FIRST occurrence moves on deletion, which matters
  for every indexOf-based anchor.
- 19 pins are live-only; **9 are escaped/regex pins my string scan could
  not resolve** — classifying those 9 by hand is part of this batch, plus
  the regex pins (e.g. verify:2299 `/\.website-today\s*\{\s*order:\s*1;/`)
  and the two live-safe slice anchors (embeddedWebsiteCss ← :3225,
  websiteUnifiedCss ← lastIndexOf at :3295).
- tools/test_theme_surface_contract.mjs reads this file too (:48) and
  exempts .website-preview-frame/-stage/-site (:79-81); its scanner and
  staleness checks see every deleted selector.

**Critical correction to the "~2,100 dead lines" framing: the region is not
uniformly dead.** `.website-preview-frame.is-tablet/.is-mobile` dimensional
bounds exist ONLY at :1512-1519 inside the region, and SitePreview.tsx:29
renders `website-preview-frame is-{device}` today — those rules are live.
Likewise `.website-preview-controls` (WebsiteProduct.tsx:1365) is styled by
the :1924-2139 mobile block. The review doc's number is a ceiling, not an
inventory. Deliverable: a rule-by-rule disposition table (live / dead /
dead-but-pinned) for :1-2145, produced by cross-referencing every selector
against rendered class names, committed beside this doc. No source edits.
**Estimate:** 1 PR (doc-only), 1 focused day. Tedious, not hard, and
everything in the website lane is wrong without it.

### P3.2 — `.website-product` triplication reconciliation (DESIGN-REVIEW prerequisite)

Four same-specificity `.website-product` blocks: :1-69 (gen-one aliases),
:2147-2167 (live "Task-first workspace shell", hardcoded literals incl.
`#5f6d65` at :2153), :3226-3233 (shared-shell), :4122-4124 (item-12 EOF
repair of --website-quiet). DESIGN-REVIEW-2026-08-18.md finding 1: any
tokenization applied to the :1 block silently no-ops. The :4122 repair
proved the pattern: an EOF-appended `.website-product` block wins the
cascade at equal specificity, pinned originals stay byte-identical
(Binding Rule 3). Batch: consolidate ALL custom-property declarations the
three earlier blocks disagree on into one EOF block (extending :4122's),
each line commented with which block it overrides; re-check the two
phase-1 claims DESIGN-REVIEW flagged (--website-green-dark's missing
.theme-dark counterpart, review "Rule 4 latent"; the 44-site contrast
claim). No deletions.
**Pins to lockstep:** none if strictly EOF-append; run the full theme
contract (Rule 4 mirroring for every consolidated property).
**Estimate:** 1 PR, half a day.
**SHIPPED 2026-08-19** (branch `design/p3-2-website-triplication`): the EOF
block now restates all 12 disputed properties (13 with `--website-quiet`)
with the values that already won the cascade, so resolved styles are
byte-identical in both themes (dev-server getComputedStyle probes, light and
dark). Panel and green take the item-12 core-alias shape (authored literal =
core light value, so the alias is value-preserving); the other nine park
their authored literal as a var() fallback behind a deliberately-undefined
`--website-*-authored` token (P3.0 carve-out — the ratchet stays at 60,
zero live hex added). Strictly EOF-append: zero verifier edits, exactly as
the pin catalogue predicted. Re-checks: (1) `--website-green-dark` is STILL
Rule-4-latent — its only consumers (:3427-3428) are a light-mode hover whose
dark variant is overridden with a literal at :3442-3444, so no dark
counterpart was added; adding one is a visual decision for whichever batch
gains a real dark-mode consumer. (2) The phase-1 "44 text sites" quiet claim
re-measures at 41 `var(--website-quiet)` sites today (28 gen-one, 13 live);
light resolution was `#5f6d65` before item-12 and `#5f6f67` (--core-quiet,
5.31:1) since — the claimed "3.66:1 → 5.31:1" delta remains unsubstantiated,
as DESIGN-REVIEW concluded (the live value was already passing).

### P3.3 — Re-home live rules, re-anchor dead-anchored pins

Move the genuinely-live rules P3.1 classified (at minimum :1512-1519
preview-frame bounds and the live members of the :1924-2139 mobile block)
into the live region, and in the SAME PR re-point the five dead-only pins
and the websiteMobileCss slice markers in verify_app_build.mjs at the new
locations. This is the one batch where verifier edits and source moves
MUST land together — either alone is red. The gen-one originals stay in
place (byte-identical) until P3.4; the moved copies win by cascade order
exactly like P3.2.
**Pins to lockstep:** verify:295-298, :3572-3573, :3957-3959, plus
whatever P3.1's table adds; expect first-occurrence shifts for the 4
both-region pins.
**Estimate:** 1 PR, 1 day including a mobile-viewport probe pass
(dev server + getComputedStyle, per the recipe below).
**SHIPPED 2026-08-20** (#468, `7f87d0ab`): executed as true MOVES, not the
copy-in-place model above — the catalogue's §7 measured all five
gen-one-anchored pins as position-independent content pins, so byte-identical
moves satisfied them with zero verifier edits and kept the P3.0 hex ratchet
at 60 (a copy would have duplicated `#0b6b3a` and the preview-frame
literals). The one mandatory lockstep edit landed as predicted: the
`websiteMobileCss` slice was re-anchored on two unique comment markers
(`/* Mobile review controls -- verify slice start/end (P3.3) */`), the
catalogue §4.3 house-style recommendation.

### P3.4 — Delete the catalogued-dead remainder

Only after P3.1-P3.3 are on main. Delete rows marked dead in the
disposition table, in 2-3 region-contiguous PRs (roughly :1-1511,
:1520-1923, :2140-2145 boundaries fall out of P3.3's actual moves) — not
one sweep, so a regression bisects to a third of the region. After each
chunk: full verify + theme contract (its scanner sees every removed
selector) + the P3.0 ratchet floor drops (gen-one region carries 52 hex
and 497 px that vanish with it). Expect the dist artifact budget to move
DOWN; do not "reclaim" the headroom in the same PR.
**Pins to lockstep:** none if P3.3 was complete — that is the test of the
catalogue. Any red here means the catalogue missed a pin: stop, fix the
catalogue, re-run.
**Estimate:** 2-3 PRs, half a day each.
**SHIPPED 2026-08-20** (chunk 1 `0633f757`, chunk 2 `134a6be4`, close-out
`1be73e86`): net 625 source lines deleted, zero pin reds — the catalogue's
safety argument held, which was the test. Two deviations from the plan
above, both evidence-forced. (1) Chunks were FAMILY-contiguous, not
region-contiguous: the theme surface contract fails a chunk that deletes a
family's `.theme-dark` override while any of its light surfaces survives
elsewhere, so each zero-consumer family (workspace chrome incl. the
catalogue-§6 live-region companions; then handoff plus the emptied gen-one
max-640 block) left whole. (2) The ratchet floor did NOT drop and the "52
gen-one hex vanish" expectation above was wrong — the dead rules carried
rgba()/var() only; the hex literals sit in the surviving gen-one base rules.
What remains at :1-1439 is base rules for still-rendered classes (their
live-region successors win by cascade) plus mixed selector lists with dead
riders — P3.9 attrition/consolidation territory, not deletion. The website
lane (P3.1 → P3.4) is CLOSED; post-deletion state and known live-region
strays are recorded in `WEBSITE-CSS-PIN-CATALOGUE.md` §8.

### P3.5 — Ecommerce literal retirement (independent lane)

129 hex occurrences in ecommerce-product.css = 17 in comments (keep; they
are the file's own audit trail) + **112 in live declarations**, bucketed by
selector family: cockpit/ops 41, preview/storefront 24, buying-workspace
15, today-card 7, merchandising/save 4, other 21. Frequency spine: #fff ×19,
#66746b ×18, #17231d ×17, #0b745e ×9 (≡ --core-green), #4655a5 ×5 (AI-desk
indigo), #56665d ×4 (≡ --core-muted light), plus ~40 singleton pastel tints
(the cockpit family: #f5faf6, #f2f8fb, #fff8ed, …).

Constraints that shape the batches:

- The 25→201 theme-contract regression (this doc, top) came from flipping
  the cockpit/buying family. THEME_BLIND
  (tools/test_theme_surface_contract.mjs:64-86) currently exempts
  .ecommerce-today, ten cockpit tints, the preview frames, and the
  buying-workspace nests — un-exempting any surface REQUIRES deleting its
  THEME_BLIND entry (staleness check), so exemption stays the default and
  each retirement is per-surface and deliberate.
- verify:3388 PINS a hex: the `.ecommerce-buying-body {` block must
  contain `color: #17231d;`. Retiring that literal edits the pin in
  lockstep or the buying-body stays literal.
- Preview-frame CONTENT stays exempt permanently (phase-2 item 12 ruling).
- color-mix precedent already exists in core-app.css (:139, :222, :495…),
  so there is no compat question.

Batches:

- **P3.5a — token-equal substitutions.** Literals that ARE a token's exact
  value on an already-token-safe surface: #0b745e→var(--core-green),
  #56665d→var(--core-muted), #17231d/#fff where the surface already sits
  on themed panels (the :1462 comment marks one such block). Byte-identical
  rendering in light; zero THEME_BLIND changes. ~30-40 occurrences.
  **DONE by attrition (2026-08-19).** Per-surface classification plus live
  both-theme computed-style probes proved zero qualifying token-equal
  substitutions remain — phase 2's per-surface work consumed them. The
  ecommerce lane starts at P3.5b; its first cockpit PR should also delete
  the dead `.ecommerce-ops-cockpit p` color declaration (`color: #526158`,
  ecommerce-product.css:722 in the :720-725 rule — always overridden by
  :1898, whose `font-size` also deadens :723; the rule's margin/line-height
  declarations are still live, keep them).
- **P3.5b — cockpit tints → color-mix.** One PR per 2-3 cockpit families.
  Recompute each pastel as `color-mix(in srgb, var(--core-green|accent) N%,
  var(--core-panel))` with N chosen so the LIGHT value matches the current
  hex (probe with getComputedStyle, not eyeballs). THEME_BLIND entries
  STAY — the cards remain deliberately light — but the tint now derives
  from tokens, so a future brand-accent change propagates. ~41 occurrences,
  3 PRs.
- **P3.5c — buying-workspace family, LAST.** Blocked on closing the
  contract blind spot DESIGN-REVIEW flagged: OPAQUE_ALPHA=0.9 classifies
  .ecommerce-request-lab (core-app.css:1594, rgba .72) as a tint, so the
  surface hosting `color: #17231d` (ecommerce-product.css:1086) is
  uncovered. First extend the contract to cover it, then retire the 15
  occurrences, editing verify:3388 in lockstep.
- **P3.5d — the ~21 "other" + today-card + merch stragglers**, same
  per-surface discipline.

**Estimate:** 6 PRs, 2-4 h each; P3.5b's color-mix matching is the slow
part. Do not start P3.5c until the contract extension is green on main.

**P3.5b/c/d CLOSED by evidence (2026-08-20).** PR #467's exhaustive interval
math proved no color-mix of existing tokens reproduces the cockpit pastels,
and the #fff conversions would flip THEME_BLIND cards in dark — the lane is
closed with an honest zero; the ecommerce ratchet ceiling stands at 111.

### P3.6 — px→rem for OS font scaling

4,693 px occurrences across the four files; 497 sit in the gen-one region
and are cheaper to delete (P3.4) than to convert — so the website-lane
ordering feeds this lane's denominator. The real constraint is the
verifier: **381 CSS string pins in verify_app_build.mjs, 67 of which
contain a px value** (e.g. `top: 54px;` verify:3072, `font-size: 12px`
verify:3010, the 44px touch-target family at verify:1073-1074, :3960).
Every batch converts one declaration family and edits its pins in the same
PR.

Scope discipline (this is NOT "all px becomes rem"):

- **Convert:** font-size (the OS-font-scaling payoff), then line-height-
  adjacent spacing where text reflow matters. core-app.css:1208 already
  uses 0.86rem — precedent exists.
- **Keep px:** 1px borders/hairlines, radii (converge via P3.9 instead),
  shadows, the 44px touch-target minimums (WCAG target size is physical,
  and the pins encode them as px — converting buys nothing and churns 67
  pins).
- Batches: **P3.6a** core-app.css font-size declarations (the --font-size-*
  ramp tokens themselves flip to rem here, converting every consumer in
  one move — check the 9px/10px micro-label deviation comments before
  touching them); **P3.6b** ecommerce + publish font-sizes; **P3.6c**
  website live-region font-sizes (post-P3.4 so the gen-one region is
  gone). P3.0's ratchet gains a px-count column in P3.6a so the floor
  tracks the lane.

**Estimate:** 3 PRs, 1 day each; the pin edits, not the conversions, are
the work. Honest risk: rem flips surface rounding differences on Android
WebView — every batch needs a 375px probe pass.

**P3.6a SHIPPED 2026-08-20** (branch `design/p3-6a-px-to-rem`): all 8
`--font-size-*` ramp definitions plus 589 plain `font-size: <N>px`
declarations and 18 clamp() px bounds in core-app.css converted to rem
(exact N/16, 4-decimal max — root 16px verified: nothing sets an html
font-size anywhere). Pin exposure measured, not assumed: exactly ONE
core-app.css font-size pin existed (verify `actionChangeCssContract`
`font-size: 12px`, the `.action-change-flow dd` rule) and moved in
lockstep to `0.75rem`; the other font-size pins target ecommerce/publish
sources (P3.6b) and no `--font-size-*` or font-size clamp pin exists. The
9-10px micro-label floors and the mobile `input` 16px iOS-zoom floor
converted value-preserving (their comments still read in px = value at
default root). The P3.0 ratchet gained its px column here as planned:
`check_css_contracts.mjs` CEILINGS now carries `{ hex, px }` per file
(px counted outside comments, deliberately NO var()-fallback carve-out),
floors stamped at measured post-batch counts (core 2435, ecommerce 440,
website 818, publish 237). Dev-server proof: computed font-sizes
byte-identical light/dark at default root; at root 20px converted core
selectors scale ×1.25 while the pinned ecommerce `font-size: 12px`
family stays fixed — that delta is the batch's payoff, not a regression.

**P3.6b SHIPPED 2026-08-20** (branch `design/p3-6b-island-px-to-rem`): the
product islands follow core. ecommerce-product.css 85 plain declarations
+ 6 clamp() px bounds (3 calls), website-product.css 144 plain + 16
clamp() bounds (8 calls), publish-workspace.css 40 plain + 2 clamp()
bounds (1 call) — 293 sites, exact N/16 at the verified 16px root.
vision-product.css needed nothing: its 11 font-sizes were born rem. Pin
exposure re-measured before editing (the P3.6a grep re-run, plus the
other verifiers that read these sheets): still exactly TWO font-size
pins — verify:3032 ecommerce `font-size: 12px` → `0.75rem` and
verify:3967 publish `font-size: 16px` → `1rem`, both lockstepped with
in-file comments. Every other px pin on these sheets (the 44px
touch-target families, `top: 54px`, `scroll-margin-top: 112px`, media
bounds) is a non-font-size family the plan keeps px; the conversion
never touched them. The publish/website 16px iOS-zoom input floors
converted value-preserving to `1rem` like P3.6a's. The ratchet
re-stamped its own px floors by exactly the converted token counts:
ecommerce 440→349, website 818→658, publish 237→195 (core stays 2435).
Dev-server proof: computed font-sizes byte-identical light/dark at the
default root on representative selectors per file; at root 20px every
probed converted selector scales exactly ×1.25 (e.g. ecommerce 12→15,
website 19→23.75, publish 13→16.25) while the px control stays fixed.
Control provenance: the ecommerce 12px family P3.6a used as its control
was converted by this very batch, so the control is index.css's
`.route-error strong` (17px) — the LAST px font-size family in the app,
out of P3.6b's scope, measured on a synthesized node because the error
boundary does not render in a healthy app. A 375px pass confirmed the
mobile overrides: input floor computes 16px, the mobile heading override
computes 30px (1.875rem), no WebView-style rounding drift at either root.

**P3.6c CLOSED — P3.6 COMPLETE (2026-08-20).** P3.6b had already converted
the website font-sizes P3.6c was scoped for (gen-one region included), so
the closeout is an audit, not a conversion. Full grep of every showroom CSS
source file (core-app.css, ecommerce-product.css, website-product.css,
publish-workspace.css, vision-product.css — born rem — and src/index.css)
for `font-size: <N>px`: exactly THREE declarations remain, all in
src/index.css's `.route-error` family (:56 `strong` 17px, :58
`.route-error-data` 13px, :71 `details` 12px). Sanctioned exemption, two
grounds, both already on record: the in-file comment at index.css:41-43 —
this surface renders precisely when a stylesheet or chunk failed to
arrive, so it deliberately depends on nothing, tokens or otherwise — and
P3.6b designated `.route-error strong` as the app's last-px control for
root-scaling probes; converting it would destroy the control. For
completeness, so a future sweep does not reopen the lane: index.css:36
carries one px font-size inside a `font:` shorthand (`font: 700 18px/1
…`, the `.product-route-loading` spinner) — outside this audit's
declaration pattern, same global-degraded-sheet rationale, same
exemption. The P3.0 px ratchet floors stand as stamped by P3.6b (core
2435 / ecommerce 349 / website 658 / publish 195 — all remaining px is
in the non-font-size families the plan keeps: borders, radii, shadows,
44px touch targets, media bounds).

### P3.7 — Bottom-nav work modes (gate satisfied)

Gate evidence: one-tap sale shipped (PR #436; CoreApp.tsx:6799, :3900).
The pinned markup contract is verify:1085-1100
(client_setup_navigation_separation_missing) — NOT :1072 as the phase-3
list said. It pins, verbatim: `mobileNavigation.length > 0 ? <nav
className="mobile-nav"`, `aria-label="Current product navigation"`, the
2-column grid-template-columns string, and two BANS (no `aria-label=
"Mobile product navigation"`, no `.mobile-nav a:first-child { display:
none; }`). Route drift is separately pinned at verify:1086
(shop,plant,website,ecommerce). Work modes therefore EXTEND: add
data-mode/aria-current attributes and any mode strip as new markup around
the pinned expressions, style via EOF-appended CSS, never rewrite the
pinned lines. Acceptance criteria are in the phase-3 list and are not
negotiable: aria-current on the active item + full keyboard regression
(tab order, focus visibility at the 44px targets, Esc/arrow behavior if a
mode strip scrolls).
**Batches:** (1) aria-current + keyboard pass on the EXISTING nav — small,
independently shippable, satisfies half the acceptance criteria before any
redesign risk; (2) the work-mode strip itself.
**Estimate:** 2 PRs; (1) is half a day, (2) is 2-3 days — it is a product
design decision, not a refactor, and should go to the founder as a probe
screenshot before the PR opens.

**P3.7 SHIPPED (2026-08-20, PR #486).** Batch (2) was already on main as
the Shop slice (Today/Sell/Orders/Stock + Products door, verify:1114-1122);
batch (1) landed as ONE EOF-appended CSS rule and zero TSX changes. The
generic two-link `.mobile-nav` (Plant, Website, Ecommerce, setup routes)
clipped the global :focus-visible ring exactly the way the Shop task bar
did — overflow: hidden bar, each link fills its grid cell, ring 2px outside
the box — so keyboard focus was invisible along the bar's fixed edges. Same
remedy as the task variant: `.mobile-nav a:focus-visible { outline-offset:
-0.1875rem; }`. The offset is rem, not px, and the rule carries NO media
guard, both deliberately: the px ratchet sits exactly at its 2435 core
ceiling (a fresh `@media (max-width: 840px)` prelude would itself have
added a live px token — the first verify run proved it, 2436 > 2435),
P3.6c closed the px audit with only the kept families remaining, and
-0.1875rem paints identically to -3px at the default root. The bare rule
is inert wherever the bar is display: none, so it can only ever style the
bar the ≤840px block has made visible. aria-current needed no
code: the bar renders NavLinks and react-router stamps aria-current="page"
on the active item — the acceptance work was PROVING it, which also closes
the on-device pass the Shop slice left open. Browser evidence (real
browser, 375x812, both themes): aria-current moves with navigation on the
generic bar (Plant→Website) and across all four Shop ?tab= modes;
tab order runs skip link → topbar → bottom bar → main; the ring paints
solid, inset, on every bar link under keyboard modality (light
rgb(11,116,94) = --core-focus, dark rgba(86,240,193,.48)) and correctly
does NOT paint on pointer focus; every bar link computes min-height 44px
(actual 63px); padding-bottom: env(safe-area-inset-bottom) is live in the
CSSOM; at 1280px the bar is display:none and the sidebar keeps its original
outside 2px ring — desktop untouched. Esc/arrow: N/A, the strip does not
scroll (five fixed minmax(0,1fr) columns, no overflow scrolling). The
:1085-1100 markup contract and the Shop-slice pins were not touched.
Plant's 2-tab slice stays parked with the Plant UX pass.

### P3.8 — Selling-surface IA

"Ops consoles behind an Operations area" = the ten cockpit surfaces pinned
at verify:1006-1019 plus .ecommerce-enterprise-controls (verify:711) and
the AI desk (verify:587-589). Those pins check CSS selector EXISTENCE and
TSX strings — regrouping components behind an Operations disclosure keeps
every class name and pinned string present, so the IA move is pin-safe by
construction. The litany rule works the same way: the pinned compliance
strings (verify:945, :1748, :1852, :3961, :3963, :5348, :5475, and the
'Review only' status pins at :837, :2105, :2366, :2431) are includes()
checks — plain-language lead lines are ADDED BEFORE them in the JSX, never
edits to them.
**Batches:** (1) lead lines above litanies (copy-only, one PR, founder
reviews the actual sentences — they are customer-facing); (2) Operations
regrouping for Ecommerce; (3) same for Shop if (2) proves out.
**Estimate:** 3 PRs; (1) half a day, (2)-(3) 1-2 days each. (2) needs the
same founder-probe-first treatment as P3.7's strip.

### P3.9 — Geometry convergence by attrition (standing rule, not a PR)

core-app.css carries 15+ distinct radius values (8px ×35, 10px ×33, 9px
×24, 12px ×14, 7px ×12, 6px ×9, 5px ×9, …) against the ramp
--radius-sm/md/lg/pill = 6/10/14/999px (core-app.css:55-58). The rule: any
batch above that touches a declaration whose radius is EXACTLY a ramp
value (6, 10, 14, 999) converts it to the token in passing; off-ramp
values (5, 7, 8, 9, 12, 16, 18) are VISUAL decisions — they convert only
when a batch is already restyling that surface and says so in the PR. No
standalone geometry PR ever; the 9px→10px class of change is exactly the
big-bang sweep the judges banned. Progress metric: the distinct-value
count in this table, re-measured whenever this doc is next revised.

**Half-retired class families (added 2026-08-21 by the dead-CSS reclaim PR).**
That PR deleted 167 rule blocks from core-app.css whose selectors need a class
token that exists nowhere in the app. Ten families could only be deleted
*partially*, because their remaining rules are comma-joined with a live
selector and those joined selectors are verifier-pinned — leaving a stylesheet
that reads as if the component is still fully styled when it is not. The
sharpest case is `.segmented-control`: its selected-state rule
(`button[aria-pressed="true"]`) and `.wide` modifier are gone, but its layout,
hover, mobile and 44px touch-target rules survive beside `.view-tabs`. Anyone
reintroducing a segmented control from what the file appears to offer gets a
control that lays out and hovers correctly and has **no visual selected state**
— silently unusable, and invisible in review because `.view-tabs` keeps its own
`[aria-selected="true"]` rule. The same shape applies to
`.core-main.has-trial-context`, `.command-grid`, `.attention-list`,
`.module-today`, `.ops-today-grid`, `.catalog-import-autopilot`,
`.setup-product-grid`, `.product-trial-actions` and `.lifecycle-grid`. Attrition
rule: the next pass that is *already* moving one of those pinned strings drops
the dead member from its selector list in passing and says so. Never a
standalone PR, and never reopen a pin just to finish one of these.

Also parked here, from the same PR: six families are dead but PINNED outright
(`.setup-launch-pack`/`-rows`, `.setup-pack-summary`, `.setup-workflow-review`,
`.company-brief-disclosure`, `.plant-production-module`) — ~3,700 source bytes
of genuine waste whose pins are 44px touch-target and live-site guards
(`verify_app_build.mjs` :5553-5556, :5579, :5577-5578, :2027/:2029, :2392, and
`verify_app_release_live.mjs` :510-512). Retiring them is a pin-moving review
of its own with a negative test per pin, not a byte-reclaim ride-along.

### P3.10 — Plant phone-width status notice is hidden, not wrapped (queued 2026-09-02)

Found by the second automated 390px browser journey (#581, `tools/journey_plant_shift_release.mjs`),
which could read the shift-close confirmation only from the DOM, never from
what a phone operator sees. Verified against source before queuing:

- `CoreApp.tsx` ~9828 renders the Plant "Start here" status line as
  `<div className="plant-today-source" role="status"|"alert"><span>{source}</span><small>{notice}</small></div>`.
  The `<small>` carries the sentences that confirm what just happened:
  "Shift packet prepared …", "Close shift … completed", and the write-blocked
  reason when `productionCanWrite` is false (that is when the container is
  `role="alert"`).
- `core-app.css` :1091 lays the `<small>` out as a right-aligned 760px-max mono
  caption on wide screens, and :2239, inside the phone-width media query, is
  `.plant-today-source small { display: none; }`.

So at 390px, the primary device, the operator who just closed a shift gets the
badge and the checklist but never the confirmation sentence, and when writes
are blocked the alert's reason is removed along with it. `display: none` also
drops the element from the accessibility tree, so `role="alert"` announces an
empty region to a screen reader on a phone. The sibling rule two lines below
(:2240-2241, `.plant-batch-disclosure > summary small { width: 100%; margin-left: 0 }`)
already shows the intended phone treatment for the same kind of caption: wrap
it under the label, do not hide it.

Scope for the planning pass (do not blind-implement from this entry):

1. Replace :2239 with the wrap treatment (`.plant-today-source { flex-wrap: wrap }`
   and `.plant-today-source small { width: 100%; margin-left: 0; text-align: left; max-width: none }`),
   EOF-appended per the binding rules, leaving :2239 byte-identical only if a
   pin covers it (check `verify_app_build.mjs` first; none found on 2026-09-02).
2. Decide whether the `role="alert"` write-blocked case should keep the mono
   caption style at all at phone width, or promote to body text: it is the
   one sentence that tells a blocked operator why nothing saves.
3. Extend the Plant journey to assert the notice is VISIBLE at 390px
   (`getComputedStyle(...).display !== 'none'` and non-zero box), so the
   regression cannot return silently; the Shop journey's counter notices
   should get the same visibility assertion for parity.
4. Check the other three products for the same `small { display: none }`
   phone-width idiom before closing (grep `small { display: none` in the
   four CSS files) and list what each hides.

### Phase-3 exit

Phase 3 is done when: ecommerce live-declaration hex = preview-frame
exemptions only; website-product.css has one `.website-product` block and
no gen-one region; the P3.0 ratchet floors equal the exemption counts;
font-size is rem-based in all four files; bottom-nav modes and the
Operations IA shipped with their acceptance criteria; and the radius
distinct-value count is falling batch-over-batch. Re-grade against the
tribunal rubric then — not before.

## EN/MY composed labels — mechanism decision (item 6 batch 2) — BLOCKED

Status: DESIGN NOTE ONLY (2026-08-20). Nothing here ships until the founder
and a native Burmese speaker have answered the two questions at the end.

Batch 1 (PR #456) applied `bi()` exact-match-only against the confirmed
entries of `showroom/src/core/i18n-actions.ts` (infrastructure from #450;
the table today measures 47 entries — 33 confirmed, 14
pending_native_review) and landed exactly 3 sites, because nearly every
real operator-facing label is COMPOSED: "Save client setup", "Open
company", "Back to sign in". Batch 2 is therefore a mechanism decision,
not more sweeping. Safety rule 1 of the table — unverified Burmese can
never surface to an operator — is load-bearing; every option below keeps
it.

### Option A — `biCompose(verb, rest)`: verb-only gloss

`biCompose('Save', 'client setup')` renders "Save client setup ·
သိမ်းမည်" — the Burmese half carries only the verb.

- (+) Zero new native review: only already-confirmed verbs render; the
  pending gate is untouched.
- (+) Covers every composed site immediately, including the parameterized
  ones a table never can ("Open {name}" template cards).
- (−) **The risk, stated plainly: the gloss names the action but not the
  target.** "Save client setup · သိမ်းမည်" and "Save restore point ·
  သိမ်းမည်" are IDENTICAL in the half a Burmese-first reader actually
  reads. SettingsPage renders "Clear order packet" (:2194) and "Clear
  packet" (:2200) on adjacent panels, and :2194 renders four
  Download-family buttons in ONE action row — under Option A those all
  gloss identically. A shop owner who trusts the Burmese half can
  confidently tap the wrong button. That is worse than English-only,
  which at least does not claim to inform.
- (−) Code-mixing: the entries are complete verb-final clauses
  (သိမ်းမည် ≈ "will save"). Appending a clause-final Burmese verb to an
  untranslated English object is code-mixed output whose naturalness we
  cannot judge from here.
- (−) Sense drift: one English verb, several Burmese ones. "Save my claim
  file" (download to disk) and "Save client setup" (persist a form) would
  carry the same သိမ်းမည် even where natural Burmese would split them —
  a mistranslation class that exact-match review never had.

### Option B — full-phrase table entries per composed label

Extend `ACTION_TRANSLATIONS` with whole composed strings, each
native-reviewed, rendered by today's `bi()` unchanged.

- (+) Correct by construction: the reviewed unit is exactly the string
  the operator sees. No ambiguity, no code-mixing, no sense drift.
- (+) Zero new mechanism; the confirmed/pending gate already enforces
  review before render.
- (−) Review volume. Measured from the PR #456 skip list: 14 distinct
  static phrases on the Core surfaces alone (list below); the
  Download/Record/Prepare/Run ops families add ~13 more distinct
  phrases; and a fuller sweep finds stragglers the PR body folded away
  ("Recover company access" SettingsPage.tsx:2151, the "Request managed
  pilot/AI/trial" family, "Keep learning checkpoint"). Item 6's actual
  hot-path scope (Shop counter, order actions, gates, close) multiplies
  this — treat ~27 as the Core-surface floor, not the program total.
  Every entry is a native-review line item.
- (−) Cannot cover parameterized labels at all ("Open
  {productDisplayName}" SettingsPage.tsx:2107, "Open {name}"
  CoreShell.tsx:564).
- (−) One covered site is verifier-pinned byte-identical
  (`>Company login</Link>`, verify_app_build.mjs ~:1070, per the #456
  body): converting it is a lockstep pin edit, not just a label swap.

### Option C — verb-highlight hybrid

Option A's composition plus typography that visually binds the English
verb to the Burmese gloss (weight/underline pairing).

- (+) Honest about partial translation — it shows WHICH word the Burmese
  covers instead of implying the whole label is translated.
- (−) Does not fix A's same-verb ambiguity; it only labels it. The two
  Clear buttons still gloss identically.
- (−) Invents a typographic convention that itself needs operator
  education; none of the tribunal benchmarks (Square, Loyverse, Odoo,
  Shopify, Wix) does anything like it.
- (−) Longest render of the three on 375px buttons that are already the
  app's longest ("Record owner approval request · မှတ်တမ်းတင်မည်").

### Recommendation: B, scoped by traffic

Option A's ambiguity failure sits exactly on the surfaces a Yangon shop
owner touches most, and rule 1 exists because a wrong Burmese string is
costlier than a missing one — the same logic rejects a right-verb,
wrong-implication gloss as the default mechanism. Option C pays A's costs
without fixing A's flaw. Option B is the only option whose failure mode
is "not translated yet", which is the failure mode we already accept.

Batch-2 coverage under B — the concrete skip list from the #456 body,
located in source (14 phrases, one native-review packet). Account path
first; it is the highest Burmese-first-traffic surface:

1. "Back to sign in" — ManagedLoginPage.tsx:149
2. "Find my company" — ManagedLoginPage.tsx:163; SettingsPage.tsx:2140
3. "Open company" — ManagedLoginPage.tsx:142, :163; SettingsPage.tsx:2140, :2151
4. "Open my Shop" — SignupPage.tsx:182
5. "Company sign in" — SignupPage.tsx:241
6. "Company login" — CoreShell.tsx:460 (verifier-pinned — lockstep edit)
   plus the aria-label at CoreShell.tsx:463
7. "Save client setup" — SettingsPage.tsx:2105
8. "Save restore point" — SettingsPage.tsx:2230
9. "Save my claim file" — SignupPage.tsx:164
10. "Export full evidence" — SettingsPage.tsx:2231
11. "Clear packet" — SettingsPage.tsx:2200
12. "Clear order packet" — SettingsPage.tsx:2194
13. "Load sample packet" — SettingsPage.tsx:2200
14. "Load sample order packet" — SettingsPage.tsx:2194 (measured in
    source; the #456 body folded it into the families line)

Explicitly NOT batch 2 (stay English-only pending a later ruling): the
Download/Record/Prepare/Run enterprise-console families
(SettingsPage.tsx:2028, :2047, :2059, :2107, :2135, :2194, :2219 — ops
traffic, not shop-owner traffic); parameterized "Open {name}"
(CoreShell.tsx:564, SettingsPage.tsx:2107 — only a composition mechanism
can cover these); busy-state ternaries ("Checking...", "Preparing
plan...").

### BLOCKED on native-speaker sign-off — two questions

1. Review the 14 batch-2 phrase translations. Drafts enter the table as
   pending_native_review (never rendered); each flips to confirmed only
   on the native speaker's explicit sign-off, per rule 1.
2. The Option-A question, asked straight: on a composed English label, is
   a Burmese verb-only gloss helpful ("this is a save-type action") or
   misleading ("saves — but saves WHAT?") for a Myanmar shop owner? If
   the answer is "helpful and idiomatic", Option A can cover the ops
   families and parameterized labels for free in a batch 3; if
   "misleading", those stay English-only until someone phrases them.

No implementation before both answers are recorded in this section.

### Batch 3 — the counter slice (SHIPPED, drafts pending). ERP-COMPETITIVE-ROADMAP §6.4 G1

Wired 2026-08-21. Scope is the surface a cashier touches and nothing else: the
four Shop work modes (`commerce-tabs.ts`, rendered by both the phone bottom bar
and the in-page toolbar — the in-page call is guarded on `view === 'commerce'`
so Plant's strip, which shares that `<nav>`, stays outside this table's blast
radius), the sales counter, the payment-QR dialog the counter opens for a
non-cash sale, and the receipt dialog. Settings, onboarding, Plant, Website and
Ecommerce are untouched.

This is BATCH 1 of the slice, not the slice. What it cannot reach, and why, is
listed in ERP-COMPETITIVE-ROADMAP §6.4 G1's status note: string attributes
(`aria-label`, `placeholder`) cannot take a ReactNode at all, and parameterised
strings ("{n} in stock", "{n} items") are the exact-match limitation the Option
B analysis above already names. Roughly half the counter's words are in those
two classes. Whoever picks this up next: those need a mechanism decision, in the
same shape as the Option A/B/C note above, before any more call sites move.

31 new full-phrase entries (the table goes 61 -> 92; the confirmed count stays
exactly 33, which is the check that this batch invented no Burmese anyone can
see), every one `pending_native_review`, drafted only from
(a) the confirmed verbs already in the table and (b) Burmese nouns this app
already ships in `shop-ledger-accounts.ts` / `shop-service-scheduling.ts`. The
`sourced:` comments mark the second class; every other entry carries the specific
call the reviewer has to make. Two entries were REFUSED rather than drafted and
the refusal is recorded in the table and pinned in the verifier — `Products` in
the bottom bar (it opens the product chooser, not the shop's goods, one cell away
from the Stock tab) and the `Cash / KBZPay / WavePay` payment triple.

What the surface shows today: no change, except the two strings whose table
entries were ALREADY confirmed and are now reached from the counter slice —
`Clear` (cart header) and `Close` (receipt dialog). Measured with a scratch flip
of all 29 drafts to `confirmed` (reverted before commit) at 1280×900 and 375×812
in both themes: no horizontal document scroll, no element past the viewport, and
every Burmese half inside its container on all four work modes and the receipt.

Findings from the code review on this batch, applied before merge and worth
keeping: `overflow-wrap: anywhere` was removed from `.bi-label` (it splits
Burmese mid-cluster and drops a flex item's min-content to one glyph — the
reasoning is in the CSS); the in-page tab call was scoped to commerce; the
payment-QR dialog was pulled INTO the slice rather than left out, because its
Close is the same already-confirmed key the receipt uses and one non-cash sale
would otherwise show a Burmese Close beside an English one; and the module's
safety rule 2 was rewritten, because batch 3's `sourced:` entries deliberately
break the "every translation is new" invariant it stated.

One mechanism addition, and only one: `bi()` now tags its wrapper
`class="bi-label"`. The phone bottom bar is five cells across a 375px viewport
under `nowrap`/`ellipsis`, which would have ellipsised away exactly the Burmese
half; the class is what lets `core-app.css` let that one label wrap. No media
query was added (`.mobile-nav` is already `display: none` above its breakpoint),
so the px ratchet is untouched.

**Still blocked, unchanged:** the two questions above. Batch 3 adds a third for
the same reviewer — see the per-entry comments, of which `Create order`
(reserves stock, does not take money), `Stock` (goods, not shares) and
`Print receipt` (two loanwords in one label) are the ones most likely to come
back wrong.

**A language setting was NOT added, deliberately.** It is not required for G1's
counter slice: `bi()` renders English AND Burmese together, so a Burmese-first
cashier reads the half they need without choosing anything, and a setting would
buy only the removal of the English half. What that removal actually costs and
buys is a founder/native question, not an engineering one — whether a Yangon
counter wants a Burmese-only till at all, whether the owner and the cashier want
different answers on the same device, and what happens to the ~70% of the app
that has no Burmese yet when a device says "Burmese only". That is its own
planning pass. The device-local shape is ready when it is wanted: the
`shopLoyaltyScopeForWorkspace` / `shop-loyalty.ts` settings pattern is the house
convention and needs no CommerceState change.

### Batch 4 — the mechanism decision batch 3 asked for (DECIDED, not yet built)

`hq/strategy/G1-STRING-MECHANISM-DECISION.md`, 2026-08-21. Batch 3 said the two
classes it could not reach — string attributes and parameterised strings — need
a mechanism decision "in the same shape as the Option A/B/C note above, before
any more call sites move". That document is it. Summary, so this section is
readable without opening it:

- **String attributes: no new function.** Move the string out of the attribute
  into a content slot and call today's `bi()` — `aria-labelledby` where visible
  text already exists, an `sr-only` node where it does not, and
  `aria-labelledby` + `aria-describedby` where the control has data as well as
  an action. This is a rendering-site change, **not** a translation-policy
  change: every string it reaches becomes an ordinary Option B entry.
- **Recommended PENDING AT VERIFICATION, not decided** — and the reason matters
  for anyone reading the first revision of that document. It originally argued
  that a node "keeps the halves separable" where a joined string cannot. That
  is **retracted**: the accessible name computation returns a **flat string**,
  and Chrome 152 was measured over the DevTools Protocol confirming that
  `aria-label`, an `sr-only` child with `lang="my"`, `aria-labelledby`, and
  `lang` on the element all compute the **byte-identical** name with no
  language field anywhere. R1 and a string-returning `biAttr()` give a screen
  reader the same thing. R1 still wins, on narrower grounds — no second
  renderer and no second pinned gate, two sites needing no table entry that
  satisfy WCAG 2.5.3 structurally, and it is the only route to the
  subtree-override fix and to `item.nameMy`. What would settle it: a real
  screen reader on the target device. There is none in this sandbox.
- **Parameterised strings: extend B's entry shape from a literal to a
  template.** The key is the English template with its placeholders; the value
  carries a Burmese template with its own placeholder positions; the composer
  substitutes into each half independently behind the same confirmed-only gate.
  B's defining property is preserved — the reviewer still writes and signs off
  the whole phrase, hole included, and chooses where the hole sits.
- **Both ship ahead of native sign-off**, because both fall back to English
  through the existing gate. That property is why they were chosen over the
  alternatives.
- **The true scope is smaller than batch 3 implied.** 14 attribute sites on the
  counter slice, not a class — 10 `aria-label`, all reachable, and the wiring
  for them is neither founder- nor native-gated. `ReceiptDialog` contributes
  zero. `Find or scan an item` was never an attribute. Of the 4 sites R1 cannot
  reach, only **one** (the QR image's `alt`) is actually an accessible name:
  both placeholders are visual-only, and the `title` duplicates a converted
  `aria-label`.
- **Gating is not what the first revision said, twice over.** Because every
  mechanism lands on the same flat string, the founder question — should a
  screen reader read a name in two languages? — reaches **any** name-bearing
  string, R1's included, not three leftover sites. And it is not a question
  about a *first* flip either: batch 3 already shipped it. 7 call sites across
  4 files render an already-`confirmed` entry inside a `<button>` or `<Link>`
  (`Cancel`, `Clear`, `Close`, `Open`, `Back` — 4 of the 7 on the cashier
  path), so those controls' accessible names are mixed-language flat strings on
  merged `main` today. The AT check is therefore **validation of shipped
  behaviour**, it is the most overdue item in that document, and it carries a
  defined remediation path: flipping the affected entries back to
  `pending_native_review` returns every site to English in one line each — cheap
  by construction, but visible to users, so a founder call on a marginal
  result. Wiring stays ungated.
- **Option A stays rejected** and Option C is untouched; §5 of that document
  argues it explicitly against this section rather than around it.
- **Two new questions for the reviewer packet**, numbered 4 and 5 there:
  numeral script (founder — Burmese vs Arabic digits inside a `{n}` template;
  blocks *confirming* the first count template, not building the mechanism),
  and whether a screen reader should ever read a control's name in two
  languages (founder).
- The census also found a live accessibility defect unrelated to Burmese: the
  counter's product tile `aria-label` overrides its own subtree, so a
  screen-reader user hears neither the price, nor the stock level, nor
  `item.nameMy`. The fix is `aria-labelledby` for the action plus
  `aria-describedby` for the data — **not** naming the tile from its contents,
  which was the first revision's proposal and which loses the verb entirely
  (measured: it also fuses the price to the stock count). A useful side effect:
  it turns the tile's and the steppers' three parameterised labels into static
  keys, removing them from R2's dependency list.

## Verification recipe for design PRs

Per batch: `node tools/run_app_verify.mjs --only verify_app_build.mjs --only
theme:surfaces` (seconds). Before PR: full `node tools/run_app_verify.mjs
--jobs 8` + `npm --prefix showroom run lint`. Expect the CI artifact-budget
to trip on real additions (it measures a fresh dist/): raise the documented
allowance in verify_app_build.mjs (~18858), never shrink product code.
Visual truth without screenshots: dev server + `getComputedStyle` probes.
