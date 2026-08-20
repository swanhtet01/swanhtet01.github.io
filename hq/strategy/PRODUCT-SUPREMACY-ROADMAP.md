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
| S1 | Camera barcode scanning (Loyverse/Square both ship it; phone-only shops have no USB scanner) | Counter search input at `CoreApp.tsx` ~1139 already handles keyboard-wedge scanners via exact-SKU-match-on-Enter (`addSearchMatch` ~1105); nothing invokes the camera. Native `BarcodeDetector` API covers Android Chrome offline, zero dependencies | **SHIPPED 2026-08-19** (#459): `BarcodeScanButton.tsx`, counter + both catalog SKU fields; camera feeds the same `addScannedValue` path as Enter. Open: on-device camera smoke test (founder, any Android phone) |
| S2 | Merchant payment QR at checkout (Wave MMQR / MyanMyanPay let one QR take KBZPay/WavePay/AYA/CB) | `payment.method` is a display string only (`business-templates.ts:32`, `commerce-workspace.ts` ~1416 `manual_qr`); no QR image exists anywhere; cashier has nothing to show a customer to scan | **SHIPPED 2026-08-19** (#465): workspace-scoped IndexedDB QR store (PNG-lossless ingest), Settings upload slots, counter + receipt amount-due dialog. Display-only, no payment API |
| S3 | Loyalty points (Loyverse's flagship small-shop draw) | Zero `loyalty` matches in `showroom/src`. NOT the rejected CRM non-goal (`portfolio.json` nonGoals) — a points ledger keyed off the existing order `customer` field is narrow | **PR1+PR2 SHIPPED 2026-08-19** (#469 accrual, #472 redemption, #482 tax-spend fix: spend derives from the listed before-tax amount; the redemption IS a prefixed `ACT-LOYREDEEM-` credit correction — one atomic write, syncs managed). PR3 (founder-gated) remains. Planning pass verdict: CommerceState CANNOT be extended now (deployed backend's exact-field `_STATE_FIELDS`/`COMMERCE_EVENTS` contracts reject any new state key on every managed sync, and the backend only updates via founder-only release dispatch). PR1 (`shop-loyalty.ts`): local-first `supermega.shop.loyalty.v1` settings + pure-projection accrual over settled orders (no stored accrual → refunds reverse structurally; `enabledAt` cutoff + `ACT-DEMO-` skip keep sample workspaces at zero) + counter balance chip, customer keyed by the existing credit-policy exact-string convention. PR2: redemption riding the existing `order_correction` credit mechanism (syncs managed with zero server change) + receipt line. PR3 (founder-gated, deferred): promote into CommerceState + `commerce.loyalty.*` events in both validators |
| S4 | Direct ESC/POS printing for driverless BT thermal printers (~$15 Myanmar-common units) | `ReceiptDialog.tsx` ~20-46 does blob-HTML + `window.print()` — fine with OS print services, dead-end for raw-byte thermal printers | FD-adjacent: buildable client-side via Web Bluetooth but unverifiable without real hardware; needs a founder-run device test |
| S5 | Multi-register / staff sessions | Already built (`enterprise-staff-roles.ts`, 10 roles) and deliberately parked behind the staff-roles researchGate sequence (`portfolio.json` ~309) | FD — sequencing decision, not an engineering gap. Do not build further |

### Ecommerce + cross-product

| # | Gap | Verified current state | Status |
|---|---|---|---|
| E1 | Product photos (Shopify/Wix/TikTok Shop are photo-first; our storefront is text-only) | `CommerceStorefrontMerchandising` (`commerce-workspace.ts` ~1059-1065) and `StorefrontPreviewItem` (`storefront-model.ts` ~20-27) have no image field at all | Extended (#483): storefront preview cards flip photo-FIRST via `:has()` when a photo exists (4:3 cover image layout; no-photo cards and non-`:has()` browsers keep the artwork card byte-identically). **SHIPPED 2026-08-19** (#459): `product-image-store.ts` IndexedDB store, downscale-on-ingest; inventory rows + counter tiles + storefront preview. One deliberate deviation from this row's sketch: NO `imageId` on the workspace record — the deployed managed backend enforces exact-field item contracts (`commerce_runtime.py` `_ITEM_FIELDS`), so the SKU→photo binding lives in IndexedDB next to the blob. Photos in the EXPORTED/published site were traced 2026-08-20 and are **founder-gated, not merely unbuilt** — the published artifact has no product to hang a photo on and device-local bytes cannot travel with a file that leaves the device; the full evidence is §3 item 3 |
| E2 | Channel list is stale for Myanmar 2026 (Facebook VPN-only; Telegram/TikTok commerce growing) | `channel-order-intake.ts:5` hardcodes `['Messenger', 'Viber', 'Phone']`; no Telegram/TikTok option; not verifier-pinned | **SHIPPED 2026-08-19** (#459): Telegram + TikTok in the manual intake const + copy + contract test; the managed AI enum deliberately untouched (extending it requires re-running the golden-set eval) |
| E3 | Abandoned-cart / follow-up messaging | No expiry/reminder logic in `storefront-request.ts`; recovery requires outbound messaging infra that does not exist | FD — hosted messaging, credential, founder consent. Parked |

### Plant

| # | Gap | Verified current state | Status |
|---|---|---|---|
| P1 | Visual job-scheduling board (Katana's signature drag-and-drop timeline) | Jobs surface is list/filter only (`CoreApp.tsx` ~7364-7373); `priority`/`dueAt` exist in the data (`production-workspace.ts` ~1008-1010) but no timeline/board UI | **SHIPPED 2026-08-19** (#484): list ⇄ board toggle (list default, per-device preference), Overdue/Today/This week/Later/No-due lanes with exclusive midnight bounds (Codex-verified), display-only — no drag-and-drop rescheduling (that is a domain write, a future slice). |
| P2 | Shop-floor barcode/QR for material issue & job dispatch (Katana Shop Floor Control) | No scanning anywhere in Plant; `'QREL'` hits are ID prefixes, not scanning | **SHIPPED 2026-08-20**: S1's `BarcodeScanButton` imported (not forked) into the two Plant fields an operator fills from a printed code at the line — job dispatch (the output panel's Job control; exact case-insensitive match against the same `activeJobs` list the dropdown renders, unmatched code stays on screen next to a no-match notice) and material issue (Materials used → `materialRef`, free text, scan applies the field's own `maxLength` cap). Input assistance only: no new domain record, event kind, or write path, and `plant_shopfloor_scan_missing` pins the two handlers against the Plant write verbs. Scanning the optional lot field and the Control-tab recall trace were deliberately left out — one scan target per form. Open (same as S1): on-device camera smoke test, founder, any Android phone |

### Website

| # | Gap | Verified current state | Status |
|---|---|---|---|
| W1 | Template variety (Wix/Shopify libraries vs our 3 fixed layouts) | `website-starter.ts` ~14-18: exactly `business-presence`, `lead-generation`, `catalog-showcase` | FD-check — "finite reviewable site" is the stated wedge (`portfolio.json`); confirm intent before widening |

### Platform / finish quality (founder: "current looks undone")

| # | Item | State | Status |
|---|---|---|---|
| F1 | Bottom-nav work modes — Shop's Today/Sell/Orders/Stock as the mobile bottom bar instead of the 2-link stub | Scoped + in build this cycle (design phase 3 item; plan on file) | **SHIPPED 2026-08-19** (#459): 4 task tabs + Products door (verifier-pinned — only ≤840px path to `/?choose=1`) via shared `commerce-tabs.ts`. Open: on-device keyboard/touch pass |
| F2 | Low-end Android ("Galaxy") performance pass | Weight normalization + system-font stacks shipped in design phase 2; no measured low-end-device profile exists. Needs a real-device or throttled-CPU Lighthouse baseline before optimizing further — measure first | **MEASURED 2026-08-19** (#481), **three findings corrected 2026-08-20, both attempted optimizations measured and reverted** (`hq/strategy/ANDROID-PERFORMANCE-BASELINE.md` + `tools/perf/measure-android-baseline.mjs`): FCP uniform ~3.9-4.2s across ALL routes under ×6 CPU + 400ms RTT. Pre-FCP JS is **91.3KB gz on every route** — the HTML-named entry set only, so there is NO dynamic-import waterfall on the first-paint path; a `modulepreload` in `index.html` measured +1.5s FCP on every route (rejected). The chooser's model layer comes from `WorkspaceStatusPanel`, not `workspace-runtime` — but deferring it measured ~931ms SLOWER on tap-through, because ~150KB of what it loads is shared with the destination product route (withdrawn, `main` behaviour kept). Counter/orders still worst main-thread (~1.0-1.2s long tasks). NEXT: static app-shell skeleton in `index.html` (only remaining FCP lever), then shrink the 91.3KB entry set — and measure tap-through journeys, not single routes |
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
   **Status 2026-08-20: run 6 attempted, BLOCKED, nothing measured —
   `hq/research/order-intake-eval-run6-attempt-2026-08-20.md`. Two independent
   blockers: no provider key in an agent environment (fails closed correctly,
   zero network calls, verified), and the agent proxy denies CONNECT to the
   OpenAI endpoint every prior run used, so a key alone would not unblock it.
   Needs a founder or CI shell with egress to that endpoint and
   `OPENAI_API_KEY` exported. Do not substitute the reachable Anthropic path —
   different model class, that would be a second baseline, not run 6.**
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

Items 1-5 of the original sequence all SHIPPED 2026-08-19 (S1/E1/F1/E2 #459,
S2 #465, S3 PR1+PR2 #469/#472/#482, P1 #484, F2 measured #481) — see the
status column in §1 for each. The operative forward sequence is now:

1. F2 follow-through, citing the measured baseline
   (`ANDROID-PERFORMANCE-BASELINE.md`). **Do not chase waterfall flattening,
   modulepreload, or chooser trimming** — the 2026-08-20 pass built and measured
   two of these and reverted both: pre-FCP JS is the 91.3KB gz entry set on every
   route (no waterfall to flatten); a `modulepreload` in `index.html` cost +1.5s
   FCP on every route; and deferring the chooser's attention panel cost ~931ms on
   tap-through, because ~150KB of what it loads is shared with the product route
   the visitor then opens. The live items are: (a) a static app-shell skeleton in
   `index.html`, the only identified lever left on first visual feedback;
   (b) shrinking the 91.3KB gz entry set, the only other thing FCP responds to;
   (c) splitting the eager model layer out of `workspace-runtime.ts`'s static
   imports — worth real transfer and parse on `/shop/*` and `/plant/`, but it
   will NOT move FCP, and it is blocked as scoped on the synchronous
   `loadCommerceWorkspace()` call in a `useState` initializer
   (`workspace-runtime.ts:509-512`). Each needs its own planning pass, and each
   must be measured on the tap-through journey, not one route in isolation.
2. ~~P2 Plant shop-floor scanning~~ — SHIPPED 2026-08-20, see the Plant table
   in §1. Remaining Plant scan surface, unclaimed and deliberately deferred:
   the Control tab's recall-lot trace already has an exact-match resolution
   and a no-match state, so it is the cheapest next scan target if a client
   asks for it.
3. ~~E1 photo follow-through~~ — **TRACED 2026-08-20, NOT BUILDABLE IN AN AGENT
   LANE; founder decision required. Do not re-chase from this line.** This item
   used to read "photos in the exported/published site are a separate decision
   (published markup is built by `website-export.ts`, untouched so far)". It is
   a separate decision, and tracing it produced a harder answer than "separate":
   the exported site has nowhere to put a photo, and the bytes could not travel
   with it if it did. Four findings, each verified against source:
   - **There is no product in the published site to attach a photo to.**
     `WebsiteArtifact` (`website-model.ts:114-121`) is `schema`, `siteName`,
     `fingerprint`, `contentDigest`, `source`, `pages` — and a page
     (`WebsiteArtifactPage`, :105-112) is navigation + hero + `PageSection[]` +
     seo, where a section (:69-74) is `id`/`eyebrow`/`title`/`body`. All text.
     `buildWebsiteHtml` renders exactly that: a hero and text cards
     (`website-export.ts` `renderPage`). No SKU, no price, no catalog row
     reaches the published file. The `catalog-showcase` template's `/catalog`
     page (`website-starter.ts:17,154`) is a page of prose, not a product list;
     `WebsiteCommerceIntake.tsx` is an in-app order-handoff surface and emits no
     published markup. Ecommerce ships no HTML export at all — its only
     downloads are the order-import CSV and two JSON review packets
     (`EcommerceProduct.tsx:557,711,1545`). So "photos in the published site"
     is not a photo change; the prerequisite is **publishing a catalog**, a new
     customer-facing surface, which the "finite reviewable site" wedge
     (`portfolio.json`, and the W1 row in §1) puts squarely in founder scope.
   - **Adding a catalog to the artifact destroys existing website workspaces.**
     `isWebsiteArtifact` (`website-model.ts:1725-1743`) is an exact-key contract
     plus `contentDigest !== 'site-' + canonicalDigest(content)`, and a retained
     artifact that fails it fails its `LocalPublishRecord`, which fails
     `restoreWorkspace` — which returns `null`, i.e. the whole persisted website
     workspace (drafts, evidence, approvals, publish history) is dropped, not
     just the artifact. That is not a guess: `verify_app_build.mjs` ~11431
     asserts exactly this shape (`website_tampered_artifact_was_accepted`, a
     one-word headline edit → `restoreWorkspace(...) === null`). Any new key
     reproduces that failure on every record already on disk.
   - **The export is pinned pure, and photos live outside the seal.** Two
     verifier pins define the contract:
     `website_static_artifact_export_missing_or_side_effectful`
     (`verify_app_build.mjs` ~3733) fails the build if `website-export.ts` so
     much as contains `fetch(`, `localStorage`, `sessionStorage`, or
     `XMLHttpRequest`; `website_artifact_export_not_deterministic` (~11416)
     calls `createWebsiteHtmlDownload` twice on one artifact and deep-compares.
     The published file is a pure, synchronous, deterministic function of a
     digest-sealed, tamper-checked artifact — that is what makes "the reviewer
     approved this fingerprint" mean "this is what got published". Reading
     photos at export time is an async read of device-local IndexedDB that no
     fingerprint, digest, or approval covers, so one approved artifact would
     export different bytes on different devices. The pin would have to be
     widened to allow the thing it was written to forbid.
   - **Republishing from a second device would silently strip every image.**
     Photos are IndexedDB, per-origin, keyed `[scope, sku]`
     (`product-image-store.ts:55-62`), and deliberately excluded from company
     backup (:25-30, and `company-backup.ts:103` names photos as the
     not-portable call). A second device signed into the same managed company
     computes the same scope string and finds an empty database, so every
     lookup returns `null` and the export emits a text-only file. The owner
     uploads it and the live site loses its pictures. Photos not travelling is
     not an edge case here; it is the documented, deliberate design.
   Size, for whoever takes the decision: a full 3-page starter export is
   **11,123 bytes** today. One photo at the ingest bound (1280px long edge,
   JPEG q0.8, `product-image-store.ts:69-70`, ~100-300KB) is 137-411KB as a
   data URI — **12x to 37x the entire current file for a single picture**, and a
   ten-item catalog lands at 1.4-4.1MB in one uncacheable HTML file the owner
   hand-uploads. The published CSP (`default-src 'none'`, no `img-src`) also
   blocks `data:` images today, so it would have to be widened.
   What the founder actually has to decide, in order: (a) does the published
   site carry a product catalog at all — a scope call, not an engineering one;
   and only if yes, (b) where published image bytes live. Device-local
   IndexedDB cannot answer (b) for an artifact that leaves the device. Hosted
   image storage can, and is FD-gated like everything hosted (item 5 below).
   A cheap honest interim, if the answer to (a) is "not yet": say so on the
   publish screen, so an owner who has uploaded photos is told the downloaded
   site file is text-only rather than discovering it after upload. That is
   customer-facing copy and needs sign-off on the sentence, same rule as
   `DESIGN-PROGRAM.md` P3.8 batch 1.
4. AI item 1 (order-intake eval) is server-only and spends no hosted gate, but
   **it cannot run from an agent lane at all** — this line previously said it
   "can run in parallel any time" and that sent a 2026-08-20 attempt at it.
   Two independent blockers, both verified that day: no provider credential is
   readable from an agent environment (the harness fails closed correctly and
   makes zero network calls), and the agent proxy denies CONNECT to the OpenAI
   endpoint every prior run used — so a key alone would not unblock it. It
   needs a founder or CI shell with egress to that endpoint. See §2 item 1's
   status block and `hq/research/order-intake-eval-run6-attempt-2026-08-20.md`
   before spending another lane on it.
5. Everything FD-tagged waits for the founder: S4 hardware test, S5/W1 scope
   decisions, E3 messaging infra, S3 PR3 (managed loyalty), hosted anything.
6. Scaling-ceiling work, from `hq/strategy/FOUNDER-BOTTLENECK-STUDY.md`
   (2026-08-20, revised twice after Codex review on #500): of the nine
   founder-only steps on the client path, seven are permanent hard limits and
   **four** of those (steps 1, 5, 6, 7) are paid ONCE for the whole company.
   Step 2 recurs per outreach batch; **step 10 recurs per client per billing
   cycle (two CLI commands); step 11 does NOT recur** —
   `grant_entitlement` refuses an already-granted entitlement
   (`billing_rail.py:1091`), so it is onboarding-or-post-revocation work.
   **The recurring cadence is not settled**: D5 (entitlement lapse policy) is
   an open founder ask, and a re-establish-each-cycle policy would add
   `revoke-entitlement` + `grant-entitlement` per cycle, roughly doubling it.
   So the per-client ceiling is not "eight founder steps"; near-term it is the
   five on-site days of the design-partner pilot. Top item is **A2: make the
   billing READ path fail closed on every mutation privilege, then decouple it
   from the write credential** (S–M, verified defect — `_assert_schema` only
   REQUIRES the mutation flags when `require_write_privilege` is true and never
   REJECTS them when false, `DELETE` is never probed for `current_user`, and
   `billing_events` UPDATE is not probed either; so merely skipping the
   privileged-role assertion would leave the "service cannot mutate billing"
   invariant resting on hand-provisioning. Mirror the existing
   `runtime_role_denied` `bool_and` idiom onto the connecting role. Prereq is a
   founder-provisioned bounded read role). **A1 (pilot measurement) was
   re-costed from M to L and dropped to second**: it is NOT a pure projection —
   only 1 of the 5 measurements is derivable from `CommerceState` (exception
   rate, and only the domain-recorded subset), 2 need device-local
   instrumentation, and 2 are irreducibly human. Do NOT implement A1 as a
   projection: `CommerceOrder` has no per-transition timestamps, `CommerceClose`
   has no start time, and `corrections[]` is a financial ledger, not an
   operator-error counter — deriving those would mislabel acceptance evidence.
   Adding order fields is backend-gated (`commerce_runtime.py` exact-field
   contracts + founder-only release dispatch), so use the device-local
   `shop-loyalty.ts` PR1 pattern. Each needs its own planning pass; do not
   blind-implement from this line.
