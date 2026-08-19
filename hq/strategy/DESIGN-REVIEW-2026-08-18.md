# Design review — phase 1 and phase-2 items 2 & 3, as shipped

Status: REVIEW ONLY (2026-08-18). Independent QA of design work shipped by a
sibling session (`08a9568b` phase 1, `155fbf60` de-branding, `160a9c72` cart
total), read against `DESIGN-PROGRAM.md`'s own binding rules. Two items were
fixed on `claude/supermega-dev-ceo-aije17`; everything else is handed back to
whoever owns the design queue. Line numbers are HEAD of that branch.

## Fixed here

- **Rule 4, shadow ramp** (`5f4ba5a9`). `--shadow-1`/`--shadow-2`/`--shadow-3`
  were `:root`-only. `--shadow-2` is declared as `var(--core-shadow)`, and a
  `var()` inside a custom property resolves against the element it is
  *declared* on, so it froze at the light `--core-shadow` and never saw the
  dark remap — the same trap the `.theme-dark` block's own comment documents
  at `core-app.css:1642-1648`. Not theoretical: the phase-2 cart sticky bar is
  the ramp's only consumer, so it shipped rendering a light shadow in dark
  mode. Mirrored at EOF; no pinned original touched.

## Two findings worth acting on before more phase-2 work

### 1. Phase 1's website tokenization is inert

`website-product.css` declares `.website-product` three times at identical
specificity — lines 1, 2147, 3226. Phase 1 added its aliases to the block at
line 1; the live "Task-first workspace shell" block at `:2147-2158` redeclares
every one of them as a hardcoded literal 2,146 lines later and wins on cascade
order. `--website-quiet` resolves to `#5f6d65` from `:2153` both before and
after the commit, so the claimed "3.66:1 → 5.31:1 across 44 text sites" did
not happen — the live value was already passing, and the tokenization has no
runtime effect.

Only two phase-1 website changes actually land: `--website-green-dark` (new,
declared nowhere else) and the `#08745d → #0b745e` fork repair, which was
correctly applied to the live block at `:2158`.

No user-visible harm today. But this is the "verify before you fix" precedent
in `CLAUDE.md` firing in the other direction: a fix applied to the dead
generation-one block that Rule 6 fences off from deletion until phase 3. Any
future website token work will silently no-op the same way until the duplicate
blocks are reconciled. **Recommendation:** treat "reconcile the three
`.website-product` blocks" as a prerequisite for phase-3 tokenization, and
re-check any phase-1 claim that depends on the line-1 block.

### 2. The cart sticky bar does not stick on phones

`.core-main.natural-scroll { overflow-y: auto }` (`core-app.css:91`,
specificity 0,2,0) outranks `.core-main { overflow: visible }` in the ≤840px
block (`:1825`, 0,1,0). So on phones `.core-main` is still the sticky
element's nearest scrollport, but `:1825` also gives it `height: auto` — it
never scrolls; the body does. A `position: sticky` element inside a scrollport
that does not scroll never leaves its static position, so the bar renders once
at the end of the workspace and is gone the moment the customer scrolls up
into the cart. The feature's stated purpose is not delivered on the target
device.

If that cascade is ever resolved the other way the failure gets worse, not
better: `bottom: var(--space-2)` = 8px puts the bar inside the fixed
`.mobile-nav` band (`:1822`, `z-index: 40`, `min-height: 64px`) at
`z-index: 12` — fully occluded. The file already carries the right offset
convention at `:1837`: `calc(80px + env(safe-area-inset-bottom))`.

Left unfixed deliberately — the offset is a visual decision on the sibling
session's active surface.

## Flagged, in rough priority order

**Cart bar (phase-2 item 3), beyond the sticky failure:**
- The bar shows a *products subtotal* with no label. The same number one row
  up is labelled `Products` (`EcommerceBuyingWorkspace.tsx:1235`), and it
  diverges from what the customer pays once Shop applies a promotion or an
  exclusive-mode tax schedule. A bold full-width money bar with no qualifier
  reads as "what I pay": a customer can watch 42,000 float through checkout
  and see 38,500 on the receipt.
- No `role`, no `aria-live`, no label on the bar
  (`EcommerceBuyingWorkspace.tsx:1371-1376`) — it is the one element that
  changes as quantities are edited, and a screen-reader user hears nothing.
- `cart.length` counts distinct SKU lines, not units, so "3 items" understates
  3 SKUs × 4 units. Inherited from the pre-existing badge and consistent with
  the program text, but both Shopify and Loyverse count units.
- The badge override (`ecommerce-product.css:1899-1903`) resets `font-size`
  and `text-transform` but not `font-family`, so the running total still
  inherits `var(--core-mono)` — the terminal face survives on the money badge,
  in a commit pair whose sibling deliberately killed exactly that look.

**Myanmar coverage (Rule 5) —** the faces were appended to `body` and
`.website-product`, but the live block at `website-product.css:2162-2164`
defines `--website-sans` (and aliases `--website-mono` onto it) with no
Myanmar face, and 38 declarations re-set `font-family` to those variables.
Burmese on those surfaces falls to per-glyph browser last-resort fallback.
One-line EOF override fixes it.

**Rule 1 literals in phase 1** (`core-app.css`): `gap: 4px 12px` at `:2473`
and `padding: 12px` at `:2525` have exact `--space-*` equivalents;
`--art: #0b745e` at `:2513` is exactly `--core-green`. The `9px`/`10px`
micro-label sizes carry an in-file rationale and read as a knowing deviation.

**Rule 4, latent —** `--website-green-dark` (`website-product.css:14`) has no
`.theme-dark .website-product` counterpart. Currently unreachable because two
hover rules override both consumers; the next consumer inherits a dark-green
hover on a mint accent.

**De-branding residue** (outside item 2's four-site scope, so not a defect —
noted for whoever scopes the next pass): `>_` still renders on every
disclosure in the website editor (`website-product.css:769`), plus
`NavigationWorkspace.tsx:118` and `PublishWorkspace.tsx:574,594`. The now-inert
`.preview-site-header > strong > span` rules survive at `:1553` and `:2904`,
and that `strong` kept `display: flex; gap: 8px` from the deleted glyph with
no `min-width: 0`, so a long Burmese site name can push the preview nav out of
a desktop preview header.

**Contract-test blind spot —** `test_theme_surface_contract.mjs`'s
`OPAQUE_ALPHA = 0.9` classifies `.ecommerce-request-lab`
(`core-app.css:1594`, `rgba(255,255,255,.72)`) as a tint rather than a light
surface, so the buying workspace — which hardcodes `color: #17231d`
(`ecommerce-product.css:1086`) with no dark counterpart — is not covered.
Pre-existing, but it is the surface the new sticky bar lives on.

## Incumbent comparison — running cart total

Shopify's Dawn-class themes keep a unit-count bubble on the cart icon and put
the money total in the drawer's sticky footer directly above a full-width
Checkout button. Loyverse never hides it: the phone POS carries a permanent
bottom bar reading `CHARGE <total>` that *is* the primary action. Both are
unit-counted, always visible while the ticket scrolls, and tappable to the
next step. SuperMega's bar is at parity on desktop for visibility, behind on
phones (it does not stick there at all), and behind everywhere on
actionability and counting semantics — a display-only div showing SKU-line
count and a pre-promotion subtotal, with "Review for Shop" still buried below
the checkout form.

## Verification run for the one fix

`node tools/test_theme_surface_contract.mjs` → 96 checks, 0 parked defects.
`npm run app:build` + `node tools/verify_app_build.mjs` → `ok: true`,
2,941,298 bytes against the 2,970,000 ceiling.
