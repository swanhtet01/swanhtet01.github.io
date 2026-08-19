# P3.8 batch 1 — plain-language lead lines above the capability litanies

Status: PROPOSAL — founder must approve copy before any implementation PR.

Scope: DESIGN-PROGRAM.md §P3.8 batch 1 of 3 (copy-only). Batches 2-3 (the
Operations regrouping for Ecommerce, then Shop) are separate PRs and are not
proposed here. This document adds nothing to the app; it drafts the sentences
the founder reviews, one checkbox per line.

## Ground rules this proposal was written against

1. **Pin safety.** Every litany below is pinned in `tools/verify_app_build.mjs`
   as an `includes()` check on the source file. Lead lines are ADDED as new
   elements BEFORE the pinned text in the JSX; the pinned strings stay
   byte-identical. Verify also BANS certain retired sentences (e.g.
   verify:5370-5372 bans the old "Bring the starting data…" launch-pack copy;
   verify:711, :722, :732-733, :813-814, :1006 ban retired Ecommerce phrasings).
   No proposed line below matches any banned string.
2. **Register.** Owner language, matching the monthly statement:
   "What you sold" / "What you gave back" / "What you bought"
   (`showroom/src/core/ShopMonthlyStatement.tsx:22-24`), "Customers owe you" /
   "You owe suppliers" (`:75-80`), "no typing, no second set of books" (`:33`),
   and MARKETING-POSITIONING.md §(e) item 12's register: "it tells you; you
   decide."
3. **Do-not-say compliance** (`hq/strategy/MARKETING-POSITIONING.md` §(e),
   items 1-16, verified 2026-08-20): no invented statistics or percentages
   (item 14), no pricing (16), no testimonials or fixture names (15), no
   counter-speed or tap-count pitch (11), no "customers visit your online
   shop" (8), no "we put your site online" (9), no "the app is in Burmese"
   (10), no "it reorders for you" (12), no sample numbers as results (13),
   nothing implying hosted/managed/premium is live or purchasable (1-4), no
   `ai-demand-advice`, Shop expiry/lot tracking, or multi-device sync (5-7).
   Every proposed line was checked against all 16.
4. **Burmese.** The only operator-facing translation table is
   `showroom/src/core/i18n-actions.ts` (47 entries, single action verbs only;
   `bi()` at :86-90 renders exact-match confirmed entries only). No existing
   app translation exists for any full sentence proposed here, so per the
   table's own safety rule 1 (unverified Burmese never surfaces to an
   operator) **no Burmese drafts are included**. Every line is marked
   `MY: needs native review`. Do not invent Burmese at implementation time
   either.

Verify line numbers below are current as of this branch (they have drifted
from the ones DESIGN-PROGRAM.md §P3.8 recorded; the strings, not the line
numbers, are the contract).

---

## The lines — approve per checkbox

### A. Ecommerce — Quote recovery cockpit

- **Current litany** — `showroom/src/products/ecommerce/EcommerceProduct.tsx:1956`
  (pinned at verify_app_build.mjs:946):
  > "Prepare stale quote review, aged request recovery, and a safe cart draft
  > from the same Shop-controlled source. No customer message, discount,
  > payment, delivery, refund, stock, or Shop write runs here."
- **Proposed lead line (EN):** Win back customers who asked for a price and
  went quiet — nothing reaches them until you send it.
- **MY:** needs native review.
- **Insertion point:** new `<p>` between `EcommerceProduct.tsx:1955`
  (`<h2>{quoteRecoveryStage}</h2>`) and the pinned `<p>` at `:1956`.

- [ ] APPROVE A

### B. Settings — AI memory preview

- **Current litany** — `showroom/src/core/SettingsPage.tsx:2111` (pinned at
  verify_app_build.mjs:1770):
  > "No customer message, payment, stock move, production write, domain
  > publish, managed write, or model training runs from this preview."
- **Proposed lead line (EN):** This is what the AI remembers about your
  business — a summary you can read, not something it can act on.
- **MY:** needs native review.
- **Insertion point:** new `<p>` between `SettingsPage.tsx:2110` (the
  `ai-memory-preview-rows` div) and the pinned `<p className="ai-memory-next">`
  at `:2111`.

- [ ] APPROVE B

### C. Settings — Premium pilot boundary

- **Current litany** — `showroom/src/core/SettingsPage.tsx:2142` (pinned at
  verify_app_build.mjs:1874):
  > "Review only. No customer send, payment, stock move, production write,
  > domain publish, or model training runs from this pilot."
- **Proposed lead line (EN):** The pilot suggests your next move; you decide
  what actually happens.
- **MY:** needs native review.
- **Insertion point:** new `<p>` between `SettingsPage.tsx:2141` (the notice
  paragraph) and the pinned `<p className="premium-pilot-boundary">` at
  `:2142`.
- Note: complies with §(e) items 1-2 — no claim that premium is purchasable
  or that a managed workspace is live; the panel's own "talk to us" flow is
  untouched.

- [ ] APPROVE C

### D. Website — order intake boundary notice

- **Current litany** — `showroom/src/products/WebsiteCommerceIntake.tsx:262`
  (pinned at verify_app_build.mjs:3992):
  > "Browser-local evidence only. No customer message, payment, delivery
  > request, or external write occurs."
- **Proposed lead line (EN):** A website request becomes a real order only
  after your staff checks it here.
- **MY:** needs native review.
- **Insertion point:** new `<p>` immediately above
  `WebsiteCommerceIntake.tsx:262`, inside the same section; the pinned
  `{notice || '…'}` expression stays untouched.
- Note: complies with §(e) item 8 — the line claims review-then-order, not a
  public storefront.

- [ ] APPROVE D

### E. Website — manual order review notice

- **Current litany** — `showroom/src/products/WebsiteCommerceIntake.tsx:211`
  (pinned at verify_app_build.mjs:3994):
  > "Review only. Stock moves and orders are created only after a signed-in
  > person confirms."
- **Proposed lead line (EN):** Check the customer, delivery, and payment, then
  confirm — your stock does not move until you do.
- **MY:** needs native review.
- **Insertion point:** new `<p>` immediately above
  `WebsiteCommerceIntake.tsx:211`; the pinned `{notice || '…'}` expression
  stays untouched.

- [ ] APPROVE E

### F. Settings — launch pack "Gate" row — RECOMMEND EXCLUDE

- **Current litany** — `showroom/src/core/SettingsPage.tsx:467` (pinned at
  verify_app_build.mjs:5379):
  > "No customer message, payment capture, delivery booking, stock move,
  > refund, or Shop write runs from setup."
- **Why exclude:** this string is a data row in `launchPackRows`, which feeds
  only the `launchPackManifest` JSON export (`SettingsPage.tsx:479,481`) — it
  is not rendered JSX. Verify itself BANS the launch-pack checklist UI
  (`verify_app_build.mjs:5369-5372` bans
  `aria-label="Selected launch pack checklist"` and the old lead sentences),
  so there is no on-screen surface to put a lead line above.
- **Proposed action:** no lead line. Documented here so batch 1 coverage of
  the plan's pin list is complete.

- [ ] CONFIRM EXCLUSION F

### G. Client data onboarding — company setup plan

- **Current litany** — `showroom/src/core/ClientDataOnboarding.tsx:933`
  (pinned at verify_app_build.mjs:5506):
  > "No customer message, payment, website publish, or automation runs from
  > this check."
- **Proposed lead line (EN):** See what will be set up for your company before
  anything runs — this step only checks.
- **MY:** needs native review.
- **Insertion point:** new `<p>` as first child of the
  `catalog-import-handoff` div at `ClientDataOnboarding.tsx:932`, before the
  inner `<div>` at `:933` whose `<small>` carries the pinned litany.

- [ ] APPROVE G

### H. Ecommerce — Order lifecycle queue

- **Current litany** — `showroom/src/products/ecommerce/EcommerceProduct.tsx:1862`
  (pinned at verify_app_build.mjs:621; the panel's "Review only" status chip
  is separately pinned at verify:838, source `:1509`):
  > "One Shop-owned record now follows each Ecommerce request through review,
  > fulfilment, payment, cancellation, refund, and return. This view reads the
  > lifecycle; Shop confirms every change."
- **Proposed lead line (EN):** See where every order stands — from first
  request to money in — in one list.
- **MY:** needs native review.
- **Insertion point:** new `<p>` between `EcommerceProduct.tsx:1861`
  (`<h2>{orderOpsPriority}</h2>`) and the pinned `<p>` at `:1862`.

- [ ] APPROVE H

### I. Plant — Cost readiness panel

- **Current litany** — `showroom/src/core/CoreApp.tsx:9248` (first sentence
  pinned at verify_app_build.mjs:2115; the "Cost gate / Review only" row is
  separately pinned at verify:2127, source `:7800`):
  > "Check good output, waste, material trace, quality release, maintenance
  > closure, and shift close before any costing package is reviewed. No
  > costing, accounting, inventory, payroll, invoice, or production write runs
  > from this panel."
- **Proposed lead line (EN):** Before you put a cost on this batch, see what
  you made, what you scrapped, and what it used.
- **MY:** needs native review.
- **Insertion point:** new element inside the panel-head `<div>` at
  `CoreApp.tsx:9248`, between `<strong>{plantCostReadinessNext}</strong>` and
  the `<small>` holding the pinned litany sentence.

- [ ] APPROVE I

### J. Shop — setup guide — NO CHANGE PROPOSED

- **Surface:** `showroom/src/core/CoreApp.tsx:2862-2869` (the "Payments /
  Review only" row is pinned at verify_app_build.mjs:2388, source `:2800`).
- **Why no change:** this panel already leads with plain language —
  `:2865` "Import products once. Then run the daily queue." and `:2866` "Use
  this only when you are adding real products, receiving stock, checking
  payment problems, or preparing end-of-day reports. Daily selling stays in
  the main order screen." It is the register the other panels should match,
  not a litany needing a lead.

- [ ] CONFIRM NO CHANGE J

### K. Shop — Accounting readiness panel

- **Current litany** — `showroom/src/core/CoreApp.tsx:6088` (first sentence
  pinned at verify_app_build.mjs:2438; the "Export gate / Review only" row is
  separately pinned at verify:2453, source `:6085`):
  > "AI checks sales capture, payment exceptions, refund exposure, supplier
  > receipts, inventory evidence, and manager review before any accounting
  > export is reviewed. No ledger, tax, payment, payable, refund, inventory,
  > or Shop write runs from this panel."
- **Proposed lead line (EN):** Check whether your sales, payments, and stock
  records are complete enough to hand to your accountant.
- **MY:** needs native review.
- **Insertion point:** new element inside the panel-head `<div>` at
  `CoreApp.tsx:6088`, between `<strong>{shopAccountingNext}</strong>` and the
  `<small>` holding the pinned litany.

- [ ] APPROVE K

---

## Summary for the founder

9 lead lines proposed (A-E, G, H, I, K), 1 exclusion to confirm (F,
manifest-only data, no rendered surface), 1 no-change to confirm (J, already
plain). All Burmese deferred to native review — nothing here ships in Burmese.
Approving a checkbox approves that one sentence verbatim; edits welcome inline.
Implementation (one copy-only PR) starts only after this page carries the
founder's approvals.
