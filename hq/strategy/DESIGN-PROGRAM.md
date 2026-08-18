# Design program — tribunal verdict and phased redesign queue

Status: phase 1 SHIPPED (PR #431, 2026-08-18). This document is the
agent-facing source of truth for the remaining design work; any agent
(Claude, Codex, or other) picking up a design item executes from here.
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
tints); bottom-nav work modes (ONLY after item 1 ships; keep pinned
'mobile-nav' markup verify:1072; aria-current + full keyboard regression are
acceptance criteria); selling-surface IA (ops consoles behind an Operations
area; plain-language lead lines added BEFORE pinned compliance litanies);
Plant UX pass (parked until Plant enters the sales path); geometry
convergence by attrition; px→rem for OS font scaling + a stylelint check
failing CI on consumed-but-undefined properties and new hex literals (must be
wired into app:verify or it never runs).

## Verification recipe for design PRs

Per batch: `node tools/run_app_verify.mjs --only verify_app_build.mjs --only
theme:surfaces` (seconds). Before PR: full `node tools/run_app_verify.mjs
--jobs 8` + `npm --prefix showroom run lint`. Expect the CI artifact-budget
to trip on real additions (it measures a fresh dist/): raise the documented
allowance in verify_app_build.mjs (~18858), never shrink product code.
Visual truth without screenshots: dev server + `getComputedStyle` probes.
