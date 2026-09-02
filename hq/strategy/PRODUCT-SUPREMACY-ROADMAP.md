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
| E1 | Product photos (Shopify/Wix/TikTok Shop are photo-first; our storefront is text-only) | `CommerceStorefrontMerchandising` (`commerce-workspace.ts` ~1059-1065) and `StorefrontPreviewItem` (`storefront-model.ts` ~20-27) have no image field at all | Extended (#483): storefront preview cards flip photo-FIRST via `:has()` when a photo exists (4:3 cover image layout; no-photo cards and non-`:has()` browsers keep the artwork card byte-identically). **SHIPPED 2026-08-19** (#459): `product-image-store.ts` IndexedDB store, downscale-on-ingest; inventory rows + counter tiles + storefront preview. One deliberate deviation from this row's sketch: NO `imageId` on the workspace record — the deployed managed backend enforces exact-field item contracts (`commerce_runtime.py` `_ITEM_FIELDS`), so the SKU→photo binding lives in IndexedDB next to the blob. Photos in the EXPORTED/published site were traced 2026-08-20: the published artifact carries no product to hang a photo on, so the gate is one founder scope call (does the published site carry a catalog at all), not hosted infrastructure. Given that, embedding is buildable device-locally, with a trilemma over where the bytes live — full evidence and the withdrawn over-claims in §3 item 3 |
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

   **RE-RANKED 2026-08-30, on measurement. Read this before picking (a), (b) or
   (c) above — two of the three are closed and the biggest lever is not among
   them.**

   **MERGE-STATE WARNING, and it is not a formality.** Every "SHIPPED" below
   means *merged into the pull request named beside it*, NOT into `main`. At the
   time of writing, `main`'s `showroom/index.html` still contains a bare
   `<div id="root"></div>` — **none of #567, #569 or #570 is an ancestor of this
   commit**, and this document may well merge before they do. So: if you are
   reading this from `main` and the change it describes is not in the tree in
   front of you, the item is **still live work waiting on a merge**, not
   finished work to skip. Codex caught this exact hazard on #571 (a document
   telling readers to stop pursuing an improvement that is not in their tree),
   and it is the same failure this whole re-ranking exists to fix — a document
   confidently describing a state the code is not in. Check `git log` for the
   named PR before acting on any row.

   - **(a) is shipped IN #567 (unmerged at time of writing).** The app-shell skeleton moved FCP 4,400 -> 3,280 ms
     on `/` and 4,516 -> 3,244 ms on the chooser, load flat. This item predicted
     "well under 1 s"; it is 3.2 s. That prediction was wrong and is corrected in
     `ANDROID-PERFORMANCE-BASELINE.md` — do not carry it forward.
   - **(b) is an HONEST ZERO (#569, unmerged), closed by evidence the way DESIGN-PROGRAM
     closed P3.5.** Removing 19.1 KB gz moved FCP +4/-8 ms; removing 40.1 KB gz
     moved it -20/-4 ms. Both inside the +/-88 ms control band, and the entire
     app-authored share of the entry set (~15 KB gz) is SMALLER than the cut that
     already measured nothing. The response to size is a step, not a slope. The
     premise also died with (a): post-#567 `jsTransferBeforeFcpBytes` is 19,068 --
     the 254 KB entry chunk has not finished when the page paints. Do not reopen
     this looking for the bytes; they were measured and they do not pay.
   - **The biggest lever was never listed here, and its larger half is now
     SHIPPED.** The render-blocking chain, not the entry set, is where the
     seconds were.
     - **Stylesheet: done in #567 (unmerged).** `showroom/vite.config.ts`'s `asyncStylesheetPlugin`
       rewrites Vite's emitted `<link rel="stylesheet">` into `/css-async.js`,
       which appends it after parsing. Measured on the real build: **FCP 3,236
       -> 1,492 ms**, and **4,400 -> 1,492 ms cumulative with the boot shell,
       a 66% reduction.** No unstyled flash (stylesheet live 835 ms before
       mount, zero bad frames). The Shop first-paint closure walk was taught the
       new shape IN THE SAME COMMIT — without that the 230 KB stylesheet would
       have silently left the closure and the byte guard would have gone blind
       while still reporting ok. Verified both ways: the closure still measures
       458,562 br q3 across 25 assets, and removing the `data-href` branch fails
       the build rather than passing.
     - ~~**Still open: `/theme-restore.js`, ~400 ms of pure latency.**~~
       **CLOSED AT ZERO 2026-09-02 (#573). Do not spend the security pass.**
       The ~400 ms was an artefact of the measurement harness serving HTTP/1.1;
       the file is 253 bytes, so its cost is almost entirely per-request, and
       per-request cost is exactly what h1's six-connection limit inflates.
       Re-measured over HTTP/2 — what Vercel serves — **deleting the tag
       entirely is worth 4 ms**, inside the ±88 ms control band. The measurement
       deleted the tag rather than inlining it, which bounds *every* variant of
       the fix, not just the `sha256` one. So the `sha256` CSP source in two
       places, and the light-flash risk that came with deferring it, buy
       nothing. The refusal is recorded in `showroom/index.html`'s own comment,
       which previously advertised "no hash and no nonce" and thereby invited
       the wrong fix.
     - **What actually remains of item 1** is the `modulepreload` deletion
       (`ENTRY-SET-REDUCTION-PLAN.md` C2), and it is a weaker candidate than it
       looked: **−116 ms over HTTP/2**, corrected 2026-09-02 by #574 from a
       recorded −436 ms that was h1-inflated the same way. Its `load` cost is
       transport-neutral at +390 ms, so the trade is ~1 : 3.4. It stays fenced
       behind the tap-through probe that does not exist in `tools/`.
     - **The transport lesson generalises, and is the durable output here.**
       Two of this item's three levers were priced on an HTTP/1.1 harness and
       both shrank on re-measurement — one to nothing. Any FCP figure in this
       estate taken before 2026-09-02 should be assumed h1-inflated until
       re-run with `--transport h2`. That flag now exists
       (`tools/perf/measure-android-baseline.mjs`).
   - **Unrelated but urgent, found on the way (#570):** the pre-FCP entry graph
     is **299,995 bytes against a 300,000 ceiling**. Five bytes. The next change
     touching any module in that graph fails the build. #570 makes the margin
     visible and the failure legible; it deliberately does not raise the ceiling.

   Measurement caveat that invalidates anything timed between 2026-08-20 and
   2026-08-30: the harness was serving runs 2 and 3 out of the service worker's
   Cache Storage (`Network.setCacheDisabled` does not touch it), reporting
   medians ~10x optimistic. Fixed in #567. A polluted row is sub-second with zero
   JS transfer bytes; no figure in the baseline document carries that signature,
   so the recorded numbers stand.
2. ~~P2 Plant shop-floor scanning~~ — SHIPPED 2026-08-20, see the Plant table
   in §1. Remaining Plant scan surface, unclaimed and deliberately deferred:
   the Control tab's recall-lot trace already has an exact-match resolution
   and a no-match state, so it is the cheapest next scan target if a client
   asks for it.
3. **E1 photo follow-through — TRACED 2026-08-20, gated on ONE founder scope
   call, not on hosted infrastructure. Read this whole entry before spending a
   lane on it; the first draft of it overstated two of its four legs and both
   are withdrawn below.** This item used to read "photos in the
   exported/published site are a separate decision (published markup is built by
   `website-export.ts`, untouched so far)". It is a separate decision, and the
   decision is narrower and more answerable than "photos": it is **whether the
   published site carries a product catalog at all**.
   - **The prerequisite, and the only real blocker: there is no product in the
     published site to attach a photo to.** `WebsiteArtifact`
     (`website-model.ts:114-121`) is `schema`/`siteName`/`fingerprint`/
     `contentDigest`/`source`/`pages`; a page (`:105-112`) is navigation + hero
     + `PageSection[]` + seo, and a section (`:69-74`) is `id`/`eyebrow`/
     `title`/`body`. All text. `buildWebsiteHtml`'s `renderPage` emits a hero
     and text cards — no SKU, no price, no catalog row reaches the published
     file. The `catalog-showcase` template's `/catalog` page
     (`website-starter.ts:17,154`) is prose. `WebsiteCommerceIntake.tsx` is an
     in-app order-handoff surface and emits no published markup. Ecommerce ships
     no HTML export at all — its only downloads are the order-import CSV
     (`EcommerceProduct.tsx:557`), an order-review JSON packet (:711), and a
     go-live activation JSON packet (:1545,
     `downloadManagedStoreActivationPacket`). So this is not a photo change.
     Publishing a catalog is a new customer-facing surface and a scope call
     against the "finite reviewable site" wedge (`portfolio.json`, and the W1
     row in §1). **That call is the founder's and nothing below is reachable
     without it.**
   - ~~"Adding a catalog to the artifact destroys existing workspaces."~~
     **WITHDRAWN — overstated, and Codex was right to hit it on #512.**
     `isWebsiteArtifact` (`:1725-1743`) is an exact-key contract plus a
     `contentDigest` recomputation, and a present-but-invalid retained artifact
     does null the whole `restoreWorkspace` result (the shape
     `verify_app_build.mjs` ~11431 pins as
     `website_tampered_artifact_was_accepted`). But that is the cost of a
     migration-less change, not an inevitability: `restoreV2` (`:1482`, called
     at `:1397` and `:1468`) is a live forward-migration hook that already
     normalizes stored `localPublishes` on load, and `isWebsiteWorkspace`
     (`:1494-1502`) shows the optional-key idiom — `Object.hasOwn` gating the
     `hasExactKeys` list for `openingPlan`/`workingSample`/`releaseRecords`/
     `leadLedger` — which leaves old records digest-identical because
     `canonicalDigest` runs over the keys actually present. Schema extension
     here is routine. Budget a migration; do not treat this as a wall.
   - ~~"Embedding photos breaks the pure/deterministic export."~~ **WITHDRAWN —
     Codex's ordering defeats it.** The pins are real
     (`website_static_artifact_export_missing_or_side_effectful`, ~3733, fails
     the build if `website-export.ts` so much as *contains* `fetch(`,
     `localStorage`, `sessionStorage`, or `XMLHttpRequest`;
     `website_artifact_export_not_deterministic`, ~11416, deep-compares two
     `createWebsiteHtmlDownload` calls). But nothing forces the blob read to
     happen at export. `recordLocalPublish` (`WebsiteProduct.tsx`) and
     `mutateWebsiteWorkspace` are both already async, so photos can be resolved
     before the seal and the exporter stays a pure synchronous function of its
     input. Both pins survive that design untouched.
   - **What actually remains is a trilemma about where the bytes live, and it
     is the thing to put in front of the founder.** Pick any two:
     (a) photo bytes appear in the published file; (b) the published file is
     determined by the sealed, approved artifact, so it reproduces identically
     on any device; (c) photo bytes stay out of localStorage.
     - *Seal the bytes into the artifact* → (a)+(b), gives up (c). The seal is
       reachable only through the workspace: `recordWebsiteSnapshot` (`:1016`)
       builds `artifact: createWebsiteArtifact(workspace)` — a verifier-pinned
       exact string (`website_approved_artifact_persistence_missing`) taking the
       workspace and nothing else. The workspace is persisted by
       `storage.setItem(WEBSITE_STORAGE_KEY, encoded)` (`:1095`), re-serialized
       whole on every write with a read-back and a second parse+serialize to
       confirm it. Every snapshot prepends another `LocalPublishRecord`
       (`:1034`) carrying its own full artifact copy. So this route puts photo
       bytes in localStorage, N copies over — the one place
       `product-image-store.ts:5-9` explicitly forbids them ("Photo blobs must
       not enter localStorage… They must not be inlined into workspace JSON for
       the same reason — every persistence, sync-outbox, and backup path
       serializes that record"). It has a hard measurable ceiling, not a soft
       one: `supermega.website.workspace.v2` is a portable backup key
       (`company-backup.ts:30`), and restore throws "Backup record N is too
       large" above `MAX_RECORD_BYTES = 4MB` (`:21,326`), with a 12MB whole-
       snapshot cap on create (`:19,361`) — on top of the ~5MB origin
       localStorage quota shared with every other product. At 137-411KB per
       photo (below), a 4-page site (`MAX_WEBSITE_PAGES = 4`, `:14`) with six
       photos is 0.8-2.5MB per retained artifact, and the second retained
       publish can alone exceed the 4MB record bound and break company backup.
     - *Resolve from IndexedDB in the async download handler* → (a)+(c), gives
       up (b). `buildWebsiteHtml` would take a second pre-resolved argument, so
       the pins still hold, and nothing enters localStorage. But the emitted
       bytes are then no longer determined by the sealed artifact: photos are
       per-origin IndexedDB keyed `[scope, sku]`
       (`product-image-store.ts:55-62`) and deliberately excluded from company
       backup (`:25-30`; `company-backup.ts:102` names photos as the
       not-portable call), so a second device signed into the same managed
       company computes the same scope string, finds an empty database, and
       exports a text-only file. **The owner re-uploads and the live site
       silently loses every picture.** Moving retained artifacts into IndexedDB
       to escape the quota lands in this same case for the same reason.
     - *Ship nothing* → (b)+(c), today's state.
   Size, which is a tradeoff to show the founder rather than a blocker: a full
   3-page starter export is **11,123 bytes** today. One photo at the ingest
   bound (1280px long edge, JPEG q0.8, `product-image-store.ts:69-70`,
   ~100-300KB) is 137-411KB as a data URI — **12x to 37x the entire current file
   for a single picture** — and a ten-item catalog lands at 1.4-4.1MB in one
   uncacheable HTML file the owner hand-uploads over a Myanmar mobile
   connection. The published CSP (`default-src 'none'`, no `img-src`,
   `website-export.ts:204`) also blocks `data:` images today and would have to
   be widened.
   So: ask the founder (a) does the published site carry a catalog, and if yes
   (b) which corner of the trilemma — accepting a localStorage ceiling, or
   accepting that a republish from a second device is text-only, or funding
   hosted image storage (FD, item 5) which is the only option that buys all
   three. A cheap honest interim while that sits: say on the publish screen that
   the downloaded site file is text-only, so an owner who has uploaded photos
   learns it before uploading rather than after. That is customer-facing copy
   and needs sign-off on the sentence, same rule as `DESIGN-PROGRAM.md` P3.8
   batch 1.
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
