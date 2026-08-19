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
   phase 3 after pin cataloguing), a full icon language.

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
sandbox); an on-device pass remains open. Remaining phase-3 items:
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

### Phase-3 exit

Phase 3 is done when: ecommerce live-declaration hex = preview-frame
exemptions only; website-product.css has one `.website-product` block and
no gen-one region; the P3.0 ratchet floors equal the exemption counts;
font-size is rem-based in all four files; bottom-nav modes and the
Operations IA shipped with their acceptance criteria; and the radius
distinct-value count is falling batch-over-batch. Re-grade against the
tribunal rubric then — not before.

## Verification recipe for design PRs

Per batch: `node tools/run_app_verify.mjs --only verify_app_build.mjs --only
theme:surfaces` (seconds). Before PR: full `node tools/run_app_verify.mjs
--jobs 8` + `npm --prefix showroom run lint`. Expect the CI artifact-budget
to trip on real additions (it measures a fresh dist/): raise the documented
allowance in verify_app_build.mjs (~18858), never shrink product code.
Visual truth without screenshots: dev server + `getComputedStyle` probes.
