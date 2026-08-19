# Product supremacy roadmap — verified competitive gaps and the AI-native feature map

Date: 2026-08-19
Status: direction (no deploy, production write, or founder-gated action authorized
by this document). Supersedes the feature-gap sections of
`ERP-COMPETITIVE-ROADMAP.md` (2026-08-14) where they conflict — that document's
"no barcode" and receipt-printing claims were verified stale on 2026-08-19.
Rule inherited from that doc: every claim cites a repo file or a source, or
names the gap outright.

Method: two independent research passes on 2026-08-19 (retail POS vs
Loyverse/Square/Odoo/Shopify + Myanmar-specific tools; Plant/Website/Ecommerce
vs Katana/Odoo Manufacturing/Shopify/Wix + Myanmar channels), every candidate
gap verified against live source before being listed. Founder direction the
same day: barcode scanning, product photo upload, low-end-Android ("Galaxy")
performance, overall finish quality, and an AI-native feature map across all
four products.

---

## 1. Verified competitive gaps, ranked (buildable-now × owner value)

Legend: BUILD = in progress or done on a branch this cycle. NOW = buildable
now, no founder gate, no new dependency. FD = founder decision/hardware/hosted
infra required first.

### Shop

| # | Gap | Verified current state | Status |
|---|---|---|---|
| S1 | Camera barcode scanning (Loyverse/Square both ship it; phone-only shops have no USB scanner) | Counter search input at `CoreApp.tsx` ~1139 already handles keyboard-wedge scanners via exact-SKU-match-on-Enter (`addSearchMatch` ~1105); nothing invokes the camera. Native `BarcodeDetector` API covers Android Chrome offline, zero dependencies | **BUILD** (2026-08-19) |
| S2 | Merchant payment QR at checkout (Wave MMQR / MyanMyanPay let one QR take KBZPay/WavePay/AYA/CB) | `payment.method` is a display string only (`business-templates.ts:32`, `commerce-workspace.ts` ~1416 `manual_qr`); no QR image exists anywhere; cashier has nothing to show a customer to scan | NOW — owner uploads their own static merchant QR in Settings, shown at amount-due. No payment API, no gate |
| S3 | Loyalty points (Loyverse's flagship small-shop draw) | Zero `loyalty` matches in `showroom/src`. NOT the rejected CRM non-goal (`portfolio.json` nonGoals) — a points ledger keyed off the existing order `customer` field is narrow | NOW (medium) |
| S4 | Direct ESC/POS printing for driverless BT thermal printers (~$15 Myanmar-common units) | `ReceiptDialog.tsx` ~20-46 does blob-HTML + `window.print()` — fine with OS print services, dead-end for raw-byte thermal printers | FD-adjacent: buildable client-side via Web Bluetooth but unverifiable without real hardware; needs a founder-run device test |
| S5 | Multi-register / staff sessions | Already built (`enterprise-staff-roles.ts`, 10 roles) and deliberately parked behind the staff-roles researchGate sequence (`portfolio.json` ~309) | FD — sequencing decision, not an engineering gap. Do not build further |

### Ecommerce + cross-product

| # | Gap | Verified current state | Status |
|---|---|---|---|
| E1 | Product photos (Shopify/Wix/TikTok Shop are photo-first; our storefront is text-only) | `CommerceStorefrontMerchandising` (`commerce-workspace.ts` ~1059-1065) and `StorefrontPreviewItem` (`storefront-model.ts` ~20-27) have no image field at all | **BUILD** (2026-08-19): IndexedDB blob store + optional `imageId` reference, downscale-on-ingest — "unlimited" photos without touching the 5MB localStorage budget |
| E2 | Channel list is stale for Myanmar 2026 (Facebook VPN-only; Telegram/TikTok commerce growing) | `channel-order-intake.ts:5` hardcodes `['Messenger', 'Viber', 'Phone']`; no Telegram/TikTok option; not verifier-pinned | NOW (small) — add Telegram + TikTok to the const, default copy, error copy |
| E3 | Abandoned-cart / follow-up messaging | No expiry/reminder logic in `storefront-request.ts`; recovery requires outbound messaging infra that does not exist | FD — hosted messaging, credential, founder consent. Parked |

### Plant

| # | Gap | Verified current state | Status |
|---|---|---|---|
| P1 | Visual job-scheduling board (Katana's signature drag-and-drop timeline) | Jobs surface is list/filter only (`CoreApp.tsx` ~7364-7373); `priority`/`dueAt` exist in the data (`production-workspace.ts` ~1008-1010) but no timeline/board UI | NOW (medium-large) — pure client-side rendering of existing job data |
| P2 | Shop-floor barcode/QR for material issue & job dispatch (Katana Shop Floor Control) | No scanning anywhere in Plant; `'QREL'` hits are ID prefixes, not scanning | NOW after S1 ships — reuse S1's camera component |

### Website

| # | Gap | Verified current state | Status |
|---|---|---|---|
| W1 | Template variety (Wix/Shopify libraries vs our 3 fixed layouts) | `website-starter.ts` ~14-18: exactly `business-presence`, `lead-generation`, `catalog-showcase` | FD-check — "finite reviewable site" is the stated wedge (`portfolio.json`); confirm intent before widening |

### Platform / finish quality (founder: "current looks undone")

| # | Item | State | Status |
|---|---|---|---|
| F1 | Bottom-nav work modes — Shop's Today/Sell/Orders/Stock as the mobile bottom bar instead of the 2-link stub | Scoped + in build this cycle (design phase 3 item; plan on file) | **BUILD** (2026-08-19) |
| F2 | Low-end Android ("Galaxy") performance pass | Weight normalization + system-font stacks shipped in design phase 2; no measured low-end-device profile exists. Needs a real-device or throttled-CPU Lighthouse baseline before optimizing further — measure first | NOW (measure), then targeted |
| F3 | Design phase 3 remainder (`DESIGN-PROGRAM.md`): selling-surface IA, ecommerce literal retirement, px→rem, stylelint CI | Queued, each needs its own planning pass | NOW, sequenced |

---

## 2. AI-native feature map (what makes this a product no incumbent can copy cheaply)

The bound stays the same as `ERP-COMPETITIVE-ROADMAP.md` §4 and
`portfolio.json`'s ai-assistance gate: golden-set evaluation, provenance,
zero side effects, human review, measured correction effort BEFORE any
interactive capability. Draft-only, approve-or-discard. That discipline IS
the moat — incumbents bolt chatbots on; we ship accountable drafts.

Ranked; each item names its gate.

1. **Order intake from chat** (design complete; 20-fixture Burmese/mixed-script
   golden set exists — `hq/research/order-intake-agent-evaluation-2026-08.md`).
   Paste a Messenger/Viber/Telegram message → draft Shop order, every field
   quoting its source text. Gate: run the server-only eval, record correction
   effort. First and only until its eval passes. This is the single
   highest-value AI feature for the Myanmar channel-commerce reality.
2. **Daily close owner brief.** Plain-language end-of-day narrative from
   on-device data that already exists (`shop-daily-close-summary.ts`,
   `shop-ar-aging-summary.ts`, `shop-order-exception-summary.ts`). Zero new
   data collection; the internal `ceo-operating-brief.ts` pattern proves the
   shape. Gate: needs its researchGate entry.
3. **Replenishment draft.** `shop-replenishment.ts` reorder signals + sales
   velocity + supplier sourcing → draft purchase requisition, never a sent PO.
   Gate: after 1 passes.
4. **Photo-assisted cataloguing** (new, unlocked by E1+S1 shipping together).
   Owner photographs a shelf item; a draft catalog row is proposed (name from
   label OCR, barcode from the same frame) for review. Pure extension of the
   same draft-and-approve surface. Gate: same ai-assistance evaluation
   discipline — a golden set of shelf photos before any operator exposure.
5. **Anomaly flags on the close.** "Today's variance is 4× your median" style
   flags computed locally from existing summaries — not an LLM feature at all;
   a projection. NOW-class, no gate beyond normal review.
6. **The GTM agent lattice** (`GTM-AI-OPERATIONS.md`) — lead research, draft
   outreach, draft follow-up, founder approves every send. Already specced;
   first lead batch produced 2026-08-19.

What we do NOT do (standing non-goals, unchanged): autonomous processors, a
Messenger bot, unreviewed external actions, CRM/workflow-suite duplication.

---

## 3. Sequence (this cycle → next)

1. Land this cycle's three builds: S1 barcode, E1 photos, F1 bottom-nav —
   each behind the full local gate, PR'd and merged separately.
2. E2 channel refresh (small, ships with or right after this batch).
3. S2 merchant payment QR (small-medium, next batch; pairs naturally with S1
   in the counter flow).
4. F2 measurement pass: throttled-CPU profile of the counter flow on a
   Galaxy-class profile; fix what the numbers name, not what taste guesses.
5. S3 loyalty + P1 job board: next medium items after the above are green.
6. AI item 1 (order-intake eval) can run in parallel any time — it is
   server-only and spends no hosted gate.
7. Everything FD-tagged waits for the founder: S4 hardware test, S5/W1 scope
   decisions, E3 messaging infra, hosted anything.
