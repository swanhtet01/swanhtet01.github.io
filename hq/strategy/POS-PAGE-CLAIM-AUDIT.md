# pos.supermega.dev — claim audit against the shipping software

Date: 2026-08-21. Method: read-only. Nothing on the live site, its Vercel
project, or any production system was changed by this audit.

## The honest headline

The page at `pos.supermega.dev` sells a product called **Shop Counter** and
makes nine checkable promises about it. Four of them are fully delivered.
Five are partial — something real exists behind each sentence, but a buyer
who read the sentence and then used the product would find less than they
were told. None of the nine is a pure fabrication: there is real software
behind every claim on that page, which is worth saying plainly before the
rest of this document lists what is wrong with it.

**The single most dangerous gap is "backup and restore."** It is dangerous in
a way the other four partials are not, because the other four disappoint a
buyer at the moment they look for the feature, whereas this one disappoints
them only after their device has died and their shop's records are already
gone. Two independent mechanisms combine into that outcome:

1. Automatic cloud backup stops working for any shop that is actually busy.
   The upload endpoint permits five uploads per five minutes per IP
   (`api/cloud-backup.js:9-10`), while the client pushes the whole workspace
   on every single commit with only a 2.5-second debounce
   (`src/lib/useCloudSync.ts:194`). **Five sales inside five minutes exhausts
   the budget** — a normal lunchtime for a cafe. There is also a hard
   payload ceiling, the `MAX_BODY_BYTES` constant (`api/cloud-backup.js:3`),
   which after base64 expansion corresponds to roughly 1.79 MiB of workspace
   JSON — on the project's own ~1,500 bytes-per-sale figure, about 1,250
   sales, or roughly a month for a shop doing forty a day. (Note for anyone
   re-reading that source line: the constant's digits happen to be identical
   to the figure published on the sales page. They are unrelated — one is a
   byte count, the other is MMK.)
2. **The owner is never told.** The sync hook does set an error state with a
   message (`src/lib/useCloudSync.ts:190-191`), but across the entire
   9,389-line `src/App.tsx` exactly one property of that hook is ever read —
   `cloudSync.restoreSettled` at `src/App.tsx:3437`. The `state` and
   `message` fields are never rendered anywhere. There is no banner, no
   pill, no toast, and no toggle. Automatic backup fails silently and the
   owner keeps trading, while the Setup screen continues to tell them that
   "encrypted cloud backup runs when online" (`src/App.tsx:8138`).

And even when the automatic backup *does* upload successfully, **it cannot be
restored onto a new device at all.** The sync identifier and the 24-hex
encryption passphrase are both minted at random into `localStorage`
(`src/lib/useCloudSync.ts:68-80`) and never displayed to the owner. When the
tablet dies, both secrets die with it, and the encrypted blob sitting in
storage is permanently undecryptable. Helper functions written for exactly
this problem — `buildPairingCode` / `parsePairingCode`
(`src/lib/cloudSync.ts:71-83`) — are covered by a test
(`tests/cloudSync.test.mjs:89-94`) but imported by no component.

The manual restore path is real and does reconstruct a full workspace
(`src/App.tsx:3219-3261`), but it requires a transfer code that is held only
in React state (`src/App.tsx:550`) and **is lost on page reload**, plus a
passphrase that is deliberately never stored. So the realistic disaster —
"the counter tablet was stolen, please restore my shop" — recovers nothing
unless the owner had independently written down two secrets, one of which
the app shows once and the other of which it never shows.

That is the conversation most likely to produce a refund demand, and it is
the one most likely to happen to the best customer, because the failure is
triggered by trading volume.

The runner-up, and the one most likely to sour a *first* conversation rather
than a later one, is the Burmese interface. It is quantified in its own
section below; the short version is that a Myanmar shop owner who switches
the app to မြန်မာ today sees **no correctly-rendered Burmese anywhere in the
operating interface**, because the only strings the language switch reaches
are byte-corrupted in the shipped bundle.

## First, a correction: this page does not sell the software in this repo

The page's built assets are named `deskpos-*`, and that naming is accurate —
it is a different codebase from the `showroom` app that this repository
ships. Specifically:

- `pos.supermega.dev` is served by the Vercel project `spa-desk-pilot`
  (project id `prj_ydSqFTuIcVBwVr61BGfxMUxrxueG`, confirmed read-only via the
  Vercel API; the domain is bound to that project).
- That project builds from the repository **`swanhtet01/supermega-workspace`**,
  in the subdirectory `spa-desk-pilot/`. This repository is
  `swanhtet01/swanhtet01.github.io`.
- This repository already knows the two are separate and enforces it: the
  build gate at `tools/verify_app_build.mjs:6582` lists `pos.supermega.dev`
  as *retired context* and fails the showroom build if that string appears in
  the built app.

Unlike what the audit brief anticipated, **the DeskPOS source is available
locally**, so the primary audit below is against the real thing rather than
against a proxy. It sits at `C:/Users/thesw/Projects/supermega-workspace/spa-desk-pilot`,
is byte-identical across all five local worktrees of that repo, has no
uncommitted modifications, and its most recent commit touching the POS is
`d43c3c1 pos: subtract pass 1 + ratified 'Shop Counter' door name (#330)` —
consistent with the "Shop Counter" branding the live page uses.

Because two different products are in play, **every verdict below is
labelled.** Verdicts marked **[SC]** judge Shop Counter / DeskPOS, the
software the page actually sells. Verdicts marked **[SR]** judge the
showroom Shop product, which is what this repository ships and which the page
does *not* sell. The [SR] column is included because the brief asked for it
and because it is genuinely useful — the two products have close to opposite
strengths, and that is the most actionable finding in this document.

## Tally

Shop Counter — the product the page sells:

| # | Claim | Verdict |
|---|---|---|
| 1 | Register checkout (cash, KBZPay, MMQR, bank transfer, card) | PARTIAL |
| 2 | Appointment bookings with deposit and self-booking | PARTIAL |
| 3 | Customer profiles and visit history | DELIVERED |
| 4 | Stock control with reorder alerts | DELIVERED |
| 5 | Daily close ledger and reports | PARTIAL |
| 6 | Offline-first PWA with backup and restore | PARTIAL |
| 7 | Burmese and English user interface | PARTIAL |
| 8 | Configured setup for spa, salon, retail, cafe, repair | DELIVERED |
| 9 | Runs on a tablet or PC, works offline | DELIVERED |

**4 delivered, 5 partial, 0 not built.** One sub-question inside claim 1 is
genuinely **UNVERIFIABLE** read-only and is called out there.

The showroom Shop product, measured against the same nine sentences, scores
**2 delivered, 6 partial, 1 not built** — worse overall, but better precisely
where Shop Counter is weakest. Details are in each claim below.

## The claims

### 1. "Register checkout (cash, KBZPay, MMQR, bank transfer, card)" — PARTIAL [SC]

All five named tenders genuinely exist as selectable options at checkout:
`src/lib/spaDesk.ts:3` defines the union (plus Wave), `src/lib/appConfig.ts:363`
lists them, and `src/App.tsx:4789-4798` renders each as a chip button. Split
tender works (`src/App.tsx:4845`). To that extent the sentence is true.

The gap is that the flat five-item list implies parity between the methods,
and there is no parity. There are three tiers.

**Cash is real.** It is counted, reconciled against the drawer at close, and
variance is explained.

**KBZPay and MMQR get a real QR but no settlement.** `src/lib/mmqr.ts` builds
a genuine EMVCo payload with a correct CRC-16/CCITT-FALSE checksum
(`src/lib/mmqr.ts:45-55`) and the sale amount embedded
(`src/lib/mmqr.ts:100-130`). This is better than the brief's prior
characterisation of "a string transform" implies — it is a competent
implementation. But the file's own header states the position exactly:
"Pure + deterministic: no network, no keys, no backend"
(`src/lib/mmqr.ts:8`). There is no merchant API call, no webhook, and no
settlement feed anywhere in the repository. The merchant identity is whatever
free text the owner pasted into a settings box (`src/App.tsx:8118-8121`).
Critically, **the sale is written as paid unconditionally** the moment the
cashier presses save — `status: 'paid'` at `src/lib/spaDesk.ts:1609`, with no
gate of any kind in `saveCheckout` (`src/App.tsx:2189-2226`).

To the brief's question of whether manual confirmation is a deliberate
documented position: **it is, unambiguously.** `PAYMENTS.md:3-8` states that
real-time auto-confirm requires a merchant API plus a signed webhook, that
this capability is gated, and that "everything short of that is manual
confirm or after-the-fact reconciliation." `PAYMENTS.md:50` lists gating
`saveCheckout` on a real paid signal as future work. The product even says so
in its own UI: `src/App.tsx:4810` tells the cashier to confirm against the
merchant phone notification and warns that "screenshots can be faked," and
`src/App.tsx:994` lists settlement auto-match as planned. The engineering
position is honest. **The marketing sentence is what departs from it** — a
buyer reading "KBZPay, MMQR" in a comma-separated list of payment methods
reads integration, and gets a QR image plus a staff member checking a phone.

**Bank transfer and card are labels only.** They are tallied
(`src/lib/spaDesk.ts:2121-2122`) and displayed (`src/App.tsx:4381`), but they
render no payment affordance at checkout — no account number, no bank name,
no reference for the customer to quote, no terminal integration. A repo-wide
search for `bankAccount`, `accountNumber`, `cardTerminal`, and `acquirer`
returns nothing in `src/`. `src/lib/posHardware.ts` covers ESC/POS receipt
printing and an RJ11 cash drawer only. They are also excluded from
reconciliation by design (`src/lib/posReconcileAdapter.ts:17-18`) and from
close verification, which tracks only KBZPay, MMQR and Wave
(`src/lib/spaDesk.ts:215-221`). The codebase's own internal wording is more
honest than the sales page: `src/lib/clientPlatform.ts:237` says the tender
**labels** can be configured in Setup.

Reconciliation exists and is decent, but it is manual: the owner downloads a
CSV from their wallet app and pastes or uploads it
(`src/lib/ReconcilePanel.tsx:56`), and a pure offline matcher compares it to
the day's recorded QR sales (`src/lib/reconcile.ts:195-291`). A second
AI-assisted endpoint exists at `api/reconcile.js` but no code calls it.

**UNVERIFIABLE sub-finding:** whether the generated QR is actually accepted by
a real KBZPay wallet cannot be settled by reading. The test suite is
self-referential — `tests/mmqr.test.mjs:8` builds its fixture with
`buildDynamicMmqr` and reads it back with `readMmqr`, so no third party ever
validates the output. `PAYMENTS.md:59` concedes the load-bearing unknown:
whether the acquirer echoes the tag-62 reference into the settlement
statement, which is the primary match key the entire reconciliation feature
depends on. Settling this needs one scan by one real wallet against one real
merchant account, and one settlement statement inspected afterwards. That is
a ten-minute test that nobody appears to have run, and it gates the honesty
of the whole payments story.

One latent defect worth fixing regardless: `src/lib/mmqr.ts:120` replaces the
entire tag-62 template rather than merging into it, silently discarding any
store label, terminal id, or mobile number the merchant's base QR carried.

**[SR] showroom: PARTIAL, and weaker.** The counter offers exactly three
tenders — `{['Cash', 'KBZPay', 'WavePay']}` at
`showroom/src/core/CoreApp.tsx:1213`. MMQR is not a tender at all, only an
owner-uploaded static QR image explicitly labelled "Display only — no payment
API is connected" (`showroom/src/core/WorkspaceControlsPage.tsx:663`). Bank
transfer and card exist only in online-order paths, not at the counter. And
the showroom counter does not complete a sale: it creates an order with
`paymentStatus: 'pending'` (`showroom/src/core/CoreApp.tsx:3517`) behind an
approval gate, with money confirmed later by reconciliation. Its own UI says
"Confirm to create the order. Finish payment and handoff in Orders"
(`showroom/src/core/CoreApp.tsx:1216`).

### 2. "Appointment bookings with deposit and self-booking" — PARTIAL [SC]

Appointments are real and well built. The model at `src/lib/spaDesk.ts:78-91`
carries services, staff, room, start time, a status lifecycle
(`src/lib/spaDesk.ts:21`) and payment status (`:22`), with a full booking UI
at `src/App.tsx:5185-5310`.

**Deposits are real for owner-entered bookings** — and better than expected.
The deposit is not merely a stored number: it is captured with an amount and
a tender (`src/App.tsx:5203`, `:5207`), carried into checkout
(`src/App.tsx:2141`), genuinely **subtracted from the final bill**
(`src/lib/spaDesk.ts:1581-1582`), shown at the register
(`src/App.tsx:4727-4730`) and on the receipt (`src/App.tsx:9349`), and
counted by tender in the daily close (`src/lib/spaDesk.ts:2090-2118`). The
one thing a buyer might expect that is missing is forfeiture on no-show:
`src/lib/noShow.ts` only *reports* whether a deposit existed
(`src/lib/noShow.ts:83`, `:111`) and never posts it as revenue.

**Self-booking is where the sentence breaks.** The public booking page exists
and a customer can fill it in unaided (`src/PublicBookingPage.tsx:129-408`),
but it is not a booking system — it is a request-slip generator.

- It is **not a public route.** It renders only when the URL carries
  `?book=<base64 of the entire catalog>` (decoded at `src/App.tsx:569-575`,
  rendered at `src/App.tsx:3420-3422`). `vercel.json` defines no `/book`
  route. There is no stable booking URL a shop could print on a signboard.
- **Submitting stores nothing and sends nothing.** `src/PublicBookingPage.tsx:181-192`
  calls `setRequest()` into React local state. The file makes zero network
  calls of any kind.
- **Delivery is manual relay by the customer** — SMS to the manager's phone,
  `navigator.share`, clipboard copy, an `.ics` file, or a "manager import
  link" the customer must send (`src/PublicBookingPage.tsx:194-196`).
- **The owner then re-keys it.** `src/App.tsx:1522-1556` decodes the request
  into a booking *draft* and asks the owner to review conflicts and press
  Save. And the deposit — the other half of the same marketing sentence — is
  **hardcoded to zero on import**: `depositAmount: 0` at `src/App.tsx:1529`.
  `SelfBookingRequest` has no deposit field at all
  (`src/lib/appConfig.ts:103-111`), so the two features the sentence joins
  with "and" do not actually compose.
- There is no shared database behind it. `src/lib/useTenantSync.ts:91-92`
  syncs only customers and sales; appointments are not synced. A Supabase
  appointments table exists (`supabase/schema.sql:135`) but no client code
  calls it.

The product is more honest than the page here too:
`src/PublicBookingPage.tsx:354` says "This does not auto-confirm the
appointment yet," and `src/App.tsx:5373` calls public booking
"request-based in this prototype."

A further real-shop weakness: because the catalog is a frozen base64 snapshot
baked into the link, price and service changes do not propagate. Every
printed QR must be re-minted and re-distributed after any price change.

**[SR] showroom: PARTIAL.** Appointments are genuinely delivered — a real
`ShopServiceBooking` model with staff, room and equipment resources and a
status lifecycle (`showroom/src/products/shop/shop-service-scheduling.ts:56-91`).
But **deposits are NOT BUILT** (no deposit field on a booking; the only
"deposit" in the codebase is a sellable restaurant SKU at
`showroom/src/products/shop/business-templates.ts:500`), and **self-booking is
NOT BUILT** (no public booking route exists in the route table at
`showroom/src/App.tsx:72-98`). Notably, the showroom Website product generates
marketing copy that *promises* customer self-booking
(`showroom/src/products/website/website-trade-brief.ts:116-118`) while only
capturing a generic lead — the same over-claim as the page under audit,
generated automatically.

### 3. "Customer profiles and visit history" — DELIVERED [SC]

This one is simply true. `CustomerProfile` at `src/lib/spaDesk.ts:48-57`
carries name, phone, email, notes, birthday and credit balance, editable at
`src/App.tsx:7657-7681`. Visit history is real and rendered:
`getCustomerSnapshots` (`src/lib/spaDesk.ts:2217-2258`) computes visit count,
total spend and last visit; `getCustomerTimeline`
(`src/lib/spaDesk.ts:2260-2298`) merges past sales and appointments; and the
Customers module renders a per-customer history panel at
`src/App.tsx:7713-7780` including the visit timeline at `:7766-7779`.

The only caveat, and it is a data-hygiene one rather than a missing feature,
is that history joins on a normalised customer *name* rather than an id
(`src/lib/spaDesk.ts:2222`), so a walk-in typed with a different spelling
will not attach to the right profile.

**[SR] showroom: NOT BUILT.** This is the sharpest divergence between the two
products. In showroom the customer is a free-text string, not a record — the
counter field has no constraint (`showroom/src/core/CoreApp.tsx:1206`), the
only client record is `{ id, name }` with no phone and no notes
(`showroom/src/products/shop/shop-inventory-foundation.ts:19`), and the design
intent is explicit that there is "No phone registry, no new record type"
(`showroom/src/products/shop/shop-loyalty.ts:91-95`). No per-customer history
function exists. Worse, ecommerce orders that *do* carry a real profile with
id and phone are flattened to a name string on import
(`showroom/src/core/CoreApp.tsx:3411`), so regulars silently split and
strangers silently merge.

### 4. "Stock control with reorder alerts" — DELIVERED [SC]

The brief was right to single this out for scrutiny — "reorder alerts"
implies the software tells the owner, not that the data would permit building
it later. It passes that test comfortably.

Stock is real and moves on its own: `InventoryItem.onHand`
(`src/lib/spaDesk.ts:59-68`) is decremented automatically on every sale
(`src/lib/spaDesk.ts:1649-1654`), covering both retail line items and service
consumable recipes, with a `StockMovement` audit row written per decrement
(`:1638-1646`). A sale is refused outright on shortage (`:1567-1570`) and
voiding restores stock (`:1710-1722`).

The alerts are surfaced unprompted in at least six places, none of which
require the owner to go looking:

- a sidebar nav badge reading "N low" (`src/App.tsx:1335-1337`, rendered at
  `:3536`);
- a dashboard health card, "Low stock needs attention — N item(s) are at or
  below reorder level," with a jump button
  (`src/lib/workspaceHealth.ts:93-96`, rendered at `src/App.tsx:3739-3762`);
- a business-insights card (`src/lib/spaDesk.ts:2765-2776`, rendered at
  `src/App.tsx:3903-3918`);
- an owner-signal panel listing the low items with on-hand versus reorder
  level (`src/App.tsx:4416-4429`);
- a header stat tile (`src/App.tsx:1216-1220`);
- a blocking stock check at checkout (`src/App.tsx:5023-5033`).

The threshold is per-product and owner-configurable (`reorderLevel`,
`src/lib/spaDesk.ts:65`, edited at `src/App.tsx:7825-7827`), not a hardcoded
constant. Receiving stock in works via signed movements with a required
reason (`src/lib/spaDesk.ts:2012-2049`), and there is a purchase-order
generator for all low items (`src/App.tsx:7881-7903`) plus days-of-cover
forecasting from real consumption (`src/lib/spaDesk.ts:2418-2436`).

Two honest caveats that do not change the verdict: every low-stock surface is
owner-role-only, so a receptionist or staff login sees none of them; and
"alert" means an in-app badge, not a push notification, SMS or email.

**[SR] showroom: DELIVERED.** Equally strong, with six surfaces of its own
including a counter attention badge (`showroom/src/core/CoreApp.tsx:1181`), a
stock-alerts tile (`:6215`), a named low-stock list (`:6539`) and a per-item
Reorder action (`:6248`), driven by
`items.filter(i => i.onHand <= i.reorderAt)` (`:1618`). This is the one claim
both products deliver.

### 5. "Daily close ledger and reports" — PARTIAL [SC]

"Reports" is delivered and "daily close" is a genuine operation. **"Ledger"
is the word that does not survive contact with the code.**

The close itself is real and is the strongest part of the feature.
`appendCloseRecord` (`src/lib/spaDesk.ts:1748-1791`) computes and stores
expected versus confirmed amounts per tender with a persisted variance for
each, and `src/App.tsx:8917-8946` implements an actual cash-drawer count with
live variance tiles. A note is mandatory whenever a variance is non-zero
(`src/App.tsx:2354-2376`). Above that sits `buildCloseInsight`
(`src/lib/closeInsight.ts:33-82`), which explains *why* the till is off —
short versus over, cash-expense cross-check, QR settlement mismatch, void
count, over-discounting. That is genuinely good work.

Reports are plural, real and exportable: a Reports module at
`src/App.tsx:5897` with profit and loss over 7-day, 30-day and month presets
plus CSV export (`:5903-5936`), revenue by payment method, expenses by
category, top services, staff revenue and commission, and a commission
ledger, alongside a date-range owner report, a ledger CSV, a full sales
history CSV and printable receipts (`src/App.tsx:3333-3371`).

But a buyer reading "ledger" expects a durable, ordered, tamper-evident
record of closes. None of those three properties holds:

- **Closes are overwritable.** `src/lib/spaDesk.ts:1781` filters out any
  existing record for the same day and prepends the new one. The owner ticks
  "Replace existing close record" (`src/App.tsx:8975-8979`) and the prior
  record is gone.
- **There is no chain and no seal.** No prev-hash, no digest, nothing.
  `SHA256` appears in the codebase only as PBKDF2 inside backup encryption
  (`src/lib/cloudBackup.ts:16`).
- **There is no day lock.** `appendSaleRecord` never consults `closeRecords`,
  so a sale dated to an already-closed day is accepted silently and nothing
  recomputes or flags the stored close, which is now simply wrong.
- **Past closes are invisible.** This is the most surprising finding.
  `closeRecords` is read in exactly one place in the whole UI —
  `src/App.tsx:928`, which finds *today's* record. There is no close-history
  screen and no close export. Yesterday's close is retrievable only by
  opening the raw JSON backup file. The panel actually labelled "Ledger"
  (`src/App.tsx:9131-9137`) renders `getLedger(workspace, todayKey())`
  (`src/lib/spaDesk.ts:2164-2214`) — a recomputed, today-only projection of
  mutable state.

The two cheapest fixes are to render `closeRecords` as a history list with
CSV export, and to block or flag sales landing on an already-closed day.
Until then the claim should read "Daily close with cash reconciliation and
reports" and drop the word ledger.

**[SR] showroom: DELIVERED**, and this is showroom's strongest area.
`CommerceClose` (`showroom/src/core/commerce-workspace.ts:636-668`) records
business date, order ids, exception ids, operator, reason, evidence reference
and a per-tender cash-count settlement with variance review. `saveCommerceClose`
(`:9579-9614`) has replay protection and an exact state-snapshot match. Exports
include a daily close packet with a `sha256:` digest (`:9748`), CSV (`:9848`),
a monthly statement and a ledger journal.

One correction to the premise the brief carried in: showroom's close is
**digest-sealed per artifact, not a linked hash chain.** `CommerceClose` has
no `previousDigest` field; the `previousDigest` chaining that does exist is on
Ecommerce customer profile and address snapshots
(`showroom/src/core/commerce-workspace.ts:976`, `:989`), not on the close
ledger. It is tamper-evident per record, which is a real and defensible
property — but it is not a chain, and internal documents should stop calling
it one.

### 6. "Offline-first PWA with backup and restore" — PARTIAL [SC]

The PWA half is substantially true; the backup and restore half is the
worst-delivered claim on the page and is described in the headline above.

**The PWA is real**, though hand-rolled — there is no `vite-plugin-pwa` and no
workbox. A manifest at `public/manifest.webmanifest` declares standalone
display with 192/512 and maskable icons, and a service worker at `public/sw.js`
is registered at `src/App.tsx:1369-1370`, with its cache version stamped from
the git SHA at build time (`scripts/build.mjs:19-32`). Shop data lives in
`localStorage` under `spa-desk-pilot.v1` (`src/lib/spaDesk.ts:598`), with an
outbox and recovery snapshots in IndexedDB (`src/lib/offlineOutbox.ts:3-9`).
Login is fully local (`src/LoginScreen.tsx:35`), so the app genuinely works
with the network down once loaded.

**One real defect in the offline story:** `public/sw.js:3` precaches only five
HTML and icon files and never the hashed `/assets/*.js` bundles, while the
activate handler deletes every cache not matching the current version
(`public/sw.js:12-19`). After each deploy there is a window in which an
offline device boots to a blank screen, because the freshly-cached
`index.html` references chunk hashes that were never cached. The runtime cache
is also network-first with no timeout, so a hanging connection — the
characteristic rural Myanmar failure — never falls through to cache.

**A second, quieter data-loss risk:** `src/lib/spaDesk.ts:1301-1305` swallows
`QuotaExceededError` with the comment "Ignore storage failures and keep the UI
usable." When `localStorage` fills, the counter keeps trading and loses the
day on reload, with no message shown.

On the specific point the brief flagged: **the literal string "Backup
unavailable" does not exist anywhere in the repository.** The closest
user-facing states are `"Invalid or too large backup payload."`
(`api/cloud-backup.js:110-113`), `"Too many backup uploads. Please wait before
trying again."` (`api/cloud-backup.js:134`), and — when `BLOB_READ_WRITE_TOKEN`
is unset — the buttons going dead behind developer-language copy on a counter
screen: "The app is online, but Vercel Blob is not connected. Add
BLOB_READ_WRITE_TOKEN to enable encrypted cloud backups."
(`src/lib/cloudBackup.ts:75`, buttons disabled at `src/App.tsx:4169`).
None of these explains the cause in terms an owner can act on; "invalid **or**
too large" does not even distinguish corruption from size, and names no
threshold, no current size and no remedy.

The reported behaviour was therefore right and the wording was wrong, and the
reality is worse than the report: the failure is not an explained message at a
size limit, it is **no message at all**, at a *rate* limit that a busy shop
hits within one lunch service.

**[SR] showroom: PARTIAL**, with the halves inverted. Its backup and restore
is the genuinely strong half — AES-GCM-256 with PBKDF2 at 600k iterations
(`showroom/src/core/company-backup.ts:430`), exported as a portable JSON file
the owner holds, with a real file-picker import and a wired two-step restore
(`showroom/src/core/CompanyBackupPanel.tsx:118-149`). New-device restore
genuinely works, because the owner possesses the file. Its lossy edge is that
backup walks only `localStorage` (`showroom/src/core/company-backup.ts:415-427`),
silently excluding product photos and payment QRs held in IndexedDB, without
warning the owner.

Its PWA half is the weak one, and this deserves separate follow-up rather than
a verdict here: the manifest and a generated service worker both exist, and
`tools/verify_app_build.mjs:510` confirms the registration string ships into
`dist` — but the registration is an inline script
(`showroom/index.html:59`) under a `script-src 'self'` CSP with no nonce or
hash (`vercel.json:21`, and a meta policy at `showroom/index.html:12`). If
that reading is right, the service worker never registers at runtime, the app
is not installable, and a cold offline start fails. Every existing gate is a
string match; none verifies registration at runtime. **This is a
read-only inference and has not been confirmed in a browser** — it should be
checked against the live app before anyone acts on it.

### 7. "Burmese and English user interface" — PARTIAL [SC]

The brief asked for the proportion of the UI a Myanmar owner actually sees in
Burmese today, on the grounds that the number is the whole verdict. It is,
and the number is **effectively zero.**

Shop Counter has **no i18n framework at all** — no translation library, no
message catalogue, no locale files. There are 18 `language === 'my'`
conditionals in the entire codebase, and most of them sit in AI-prompt
builders (`src/lib/aiCompose.ts`, `src/lib/dailyBrief.ts`,
`src/lib/diagnosisNarrative.ts`) where they instruct a model to *generate*
Burmese text, which is a different thing from having a Burmese interface.

Inside `src/App.tsx` — 9,389 lines, essentially the whole product — the
language preference is consulted exactly five times, and only two of those do
anything to the interface: `src/App.tsx:1488-1489` sets the document `lang`
attribute and a `lang-my` body class, which `src/styles.css:80-82` uses solely
to switch the font to Noto Sans Myanmar. The other three render the language
chip and the language picker itself.

Every remaining Burmese string in the product reaches the screen through one
table, `MODULE_COPY_MY_READABLE` (`src/lib/appConfig.ts:277`), consumed by
`moduleCopy()` (`src/lib/appConfig.ts:379-381`) at three call sites
(`src/App.tsx:1206`, `:3526`, `:9377`) which render the module navigation
labels and the active module's header. That table is the entire Burmese
interface. Measured:

- 13 modules × 3 fields = **39 translated fields total**, against 1,089
  literal JSX text nodes across the app's `.tsx` files. Even at best, the
  language switch can reach about **3.6% of the interface**; checkout,
  bookings, stock, close and reports are English regardless of the setting.
- Of those 39 fields, **34 are English anyway** even inside the "Burmese"
  table — `stock.label` is "Stock", `setup.label` is "Setup",
  `hardware.label` is "Hardware", `settings.label` is "Settings", and the
  entire `platform` entry including its description is English prose. Most
  `shortLabel` values are English loanwords ("POS", "Task", "Booking",
  "Close", "P&L").
- Only **5 fields were ever written in Burmese** — and **all 5 are
  byte-corrupted in the source file.**

That last point is the finding. `src/lib/appConfig.ts` stores those five
strings as UTF-8 that has been decoded as CP1252 and re-encoded — classic
double-encoding. Verified at byte level: the file's bytes for what should be
`ယနေ့ စာမျက်နှာ` ("Today" page) are `c3 a1 e2 82 ac c5 a1 …`, which decodes
to `á€š…`; round-tripping that through CP1252 recovers the intended Burmese
exactly. By contrast `src/App.tsx:5446` holds clean UTF-8 Burmese
(`e1 80 94` = U+1014), so this is specific to that one file and not a
repository-wide encoding problem.

**And the corruption is live.** The deployed bundle
`/assets/index-DB9xIfaG.js` contains 351 occurrences of the `á€` mojibake
signature, and the shipped module table reads
`label:"á€šá€”á€±á€· á€…á€¬á€™á€»á€€á€ºá€”á€¾á€¬"`. Of the labels in that
shipped table, **zero render as correct Burmese and four render as garbage.**

So the practical answer for a Myanmar owner switching to မြန်မာ today: the
font changes, the navigation labels turn into mojibake, and nothing else
changes. The only correctly-rendered Burmese in the product is a static help
panel (`src/App.tsx:5473-5496`), the error boundary
(`src/main.tsx:60,66,82`), and the language chips themselves — 21 of 1,089
text nodes, **1.93%**, essentially all of it documentation rather than
interface.

Two consequences worth naming. First, this is the cheapest high-value fix on
the entire list: re-saving one file with correct encoding turns four garbage
labels into real Burmese in an afternoon. Second, the corruption reached
production because that repository has no encoding gate — whereas *this*
repository does, at `tools/verify_app_build.mjs:6585`, which fails the build
on `\uFFFD`, `â€"`, `Â` and `ð` markers. That guard does not currently include
the `á€` signature that Burmese double-encoding produces, and adding it would
be a one-line improvement to a check that already exists.

**[SR] showroom: PARTIAL, for a completely different reason.** Its encoding is
clean — zero mojibake across all 7 files containing Burmese script, 138 lines
total. Its problem is reach. The `bi()` helper
(`showroom/src/core/i18n-actions.ts:86`) composes `English · Burmese` for
entries at `status: 'confirmed'` and falls back to plain English otherwise,
which is a genuinely sound safety design — 33 verbs are confirmed and 14 sit
at `pending_native_review`, deliberately rendering as English so an
unreviewed guess can never reach an operator.

But the brief's concern about the pending batch turns out to be the smaller
issue. **`bi()` is called at only 4 sites across 2 files**
(`showroom/src/core/CoreApp.tsx:972`,
`showroom/src/core/SettingsPage.tsx:2084`, `:2105`, `:2233`), using just 3
distinct strings, against **438 `<button>` elements** in the showroom `.tsx`
files — **0.9%**. Thirty-three confirmed translations exist and thirty of them
are never used anywhere. None of the 14 pending entries is called at all, so
the pending batch currently costs nothing.

The inconsistency is visible within single rows: at
`showroom/src/core/CoreApp.tsx:972` one button renders `bi('Cancel')` while
its sibling in the same `form-actions` div renders the plain string
`'Applying…'` or `'Create order'`. Showroom's remaining Burmese is data-layer
nouns — service names, ledger accounts
(`showroom/src/products/shop/shop-service-scheduling.ts`,
`showroom/src/core/shop-ledger-accounts.ts`) — which is real but is not the
interface either.

Net: **neither product has a Burmese user interface.** Shop Counter has a
broken 3.6% ceiling; showroom has a clean 0.9% floor with the machinery
already built to go further cheaply.

### 8. "Configured setup for spa, salon, retail, cafe, and repair" — DELIVERED [SC]

For the product the page actually sells, this claim is true, including the two
trades the brief was most worried about. `src/lib/businessTemplates.ts` ships
**eleven** templates:

| key | Name |
|---|---|
| `spa` | Spa and wellness |
| `salon` | Salon and beauty |
| `retail` | Retail shop |
| `cafe` | Cafe and quick service |
| `service` | Repair and service desk |
| `clinic` | Clinic and health center |
| `restaurant` | Restaurant and food stall |
| `gym` | Gym and fitness center |
| `pharmacy` | Pharmacy and drug store |
| `school` | Tutoring and learning center |
| `laundry` | Laundry and dry cleaning |

All five advertised trades resolve: spa, salon, retail and cafe map to
identically named templates, and "repair" ships as `service` — "Repair and
service desk," whose primary flow is "Create job -> assign technician ->
collect deposit/final payment -> close job" (`src/lib/businessTemplates.ts:176-182`).
A buyer arriving for salon or repair finds a real, purpose-built setup.

**[SR] showroom: PARTIAL, and this is where the two lists diverge badly.**
Showroom ships ten templates
(`showroom/src/products/shop/business-templates.ts`): `mini-mart`,
`pharmacy`, `phone-electronics`, `fashion`, `hardware`, `tea-coffee`,
`auto-parts`, `restaurant`, `beauty-spa`, `bakery`. Against the five
advertised trades:

- **spa, retail and cafe are covered.** `beauty-spa` (`:406`) is strong;
  retail is served by six concrete trades rather than a generic "Retail";
  `tea-coffee` (`:294`) and `bakery` (`:442`) cover cafe under
  Myanmar-market names.
- **salon is a near-miss that would cost the buyer every service.** There is
  no salon, barber or hair template. The spa pack's seven services are
  massage, oil massage, foot massage, facial, body scrub, herbal steam and
  consultation — no cut, colour, blow-dry, manicure or pedicure. The only
  hair-adjacent artifact in the whole product is a retail SKU, "Bamboo hair
  comb." A salon owner would land on "Beauty spa" and have to re-author
  everything.
- **repair finds nothing at all.** No repair, workshop or work-order concept
  exists; every "repair" match in the codebase means data repair. The two
  plausible near-misses both fail: `auto-parts` (`:331`) is parts retail on
  the retail pack, so its services are "Personal shopping" and "Pickup
  window"; `phone-electronics` (`:182`) sells chargers and cases, not phone
  repair.

There is a deep-link consequence worth fixing on its own:
`shopBusinessTemplateFromQuery` returns `null` for unknown ids
(`showroom/src/products/shop/business-templates.ts:553-557`), so any marketing
link of the form `?template=salon` or `?template=repair` silently resolves to
nothing and drops the buyer on an unselected picker.

### 9. "Runs on a tablet or PC, works offline" — DELIVERED [SC]

True, subject to the service-worker precache defect described under claim 6.
It is a browser app with an installable manifest, a registered service worker,
local-first storage and an offline-capable login, so it genuinely runs on a
tablet or a PC and keeps working when the connection drops.

**[SR] showroom: PARTIAL.** Tablet and PC support is fine — viewport meta and
21 media queries across sensible breakpoints (`showroom/src/core/core-app.css:1801-2290`).
Storage is local-first and nothing external gates first paint. But there is
**zero online/offline detection anywhere in `showroom/src`**, and if the CSP
reading under claim 6 is correct then a cold start with no network fails.
Separately, barcode scanning calls `getUserMedia`
(`showroom/src/core/BarcodeScanButton.tsx:84`) while `vercel.json:22` sets
`Permissions-Policy: camera=()`, so the scanner always takes its blocked path
on exactly the device where counter scanning matters.

## Flagged, not resolved: the published price

The page states a specific setup figure. It appears **four times in the page
shell** — in `<meta name="description">`, `og:description`,
`twitter:description`, and in the `schema.org` `offers` block as
`"price": "<the published figure>"`, `"priceCurrency": "MMK"`,
`"availability": "InStock"`. It does **not** appear in the visible on-page
copy: the landing text a buyer actually reads says only "No monthly fee"
(`src/LoginScreen.tsx:63-66`), which is consistent with the code — there is no
subscription, renewal or recurring-charge mechanism anywhere in the product.

Project memory records the current pricing position as *custom quote per
customer, with no public prices*. These two cannot both be current, and this
audit cannot determine which one is. **This is flagged for the founder to
decide, not resolved here.**

Two things make it more urgent than an ordinary copy inconsistency. First,
because the figure lives in meta and structured data rather than visible copy,
**it is invisible to a human reading the page but fully legible to machines** —
so nobody reviewing the page visually would ever notice it. Second,
`schema.org` `offers` markup is precisely the form that search engines and AI
assistants ingest, cache and repeat. A published `Offer` with a concrete price
and `InStock` availability is the format most likely to be quoted back at the
founder by a prospect who never visited the site, and to persist in third-party
caches long after the page is edited. If the intended position is
quote-per-customer, the `offers` block should be removed rather than merely
hidden, and the three `description` meta tags amended.

By contrast, the main site publishes only an `Organization` JSON-LD block with
no product or offer markup at all.

## What this page does better than supermega.dev, and what to borrow

This is the part worth acting on, and the comparison is unflattering to the
main site in a way that is entirely fixable — the fixes are copy and markup
changes, not product work.

`supermega.dev` currently opens with the title **"SuperMega | Four products"**
and the meta description "Four focused SuperMega products for retail,
production, websites, and ecommerce ordering." On the page: "Pick one product
and try the working sample," then "Choose a product," then "Four focused
products," then "Choose one product to try." The visitor is asked, four
separate times, to perform an act of self-classification before they are told
anything about what they would get. The names they must choose between —
Shop, Plant, Website, Ecommerce — are the *company's* internal product
taxonomy, not categories a Yangon shop owner would use to describe their own
problem.

`pos.supermega.dev` opens with **"Shop Counter — the simple POS for Myanmar
businesses"** and one sentence: "Spa, salon, retail, cafe, repair — pick a
template, set your prices and staff, and sell. MMK / KBZPay / MMQR / cash from
day one. Runs on a tablet or PC, works offline. No monthly fee."

Five specific things the main site should borrow:

**1. Name the buyer's trade, not the software's category.** The POS page lists
five trades in its first sentence. A salon owner recognises "salon" instantly;
nobody recognises themselves in "four focused products." Word-bounded search
of the entire main-site HTML finds the word "retail" three times and **no
occurrence of spa, salon, cafe, repair, restaurant or bakery** — despite this
repository shipping ten trade templates including several of those. The
templates exist; the page simply never says their names. This is the single
highest-leverage change and it costs nothing but copy.

**2. Name the local payment rails in the hero, not in a sub-bullet.** "MMK /
KBZPay / MMQR / cash from day one" does more competitive work in eight words
than any feature list, because it tells a Myanmar owner the software was built
for them rather than translated at them. The main site mentions KBZPay and
WavePay exactly once each, buried in a product bullet.

**3. Answer the two objections before they are raised.** "Runs on a tablet or
PC, works offline" and "No monthly fee" pre-empt the two questions every
Myanmar SMB buyer asks — *what do I need to buy* and *what will this cost me
every month*. Neither "offline" nor "tablet" appears anywhere on the main
site, even though offline-capable local-first operation is one of the
genuinely strong things this repository ships.

**4. Publish `SoftwareApplication` structured data per product.** The POS page
carries a `schema.org` `SoftwareApplication` block with a seven-item
`featureList`, an `operatingSystem` value and a publisher. The main site
carries only `Organization`. This is why an AI assistant asked "what POS
software works with KBZPay in Myanmar" has something concrete to retrieve
about Shop Counter and nothing comparable about Shop. Given the pricing
question above, the recommendation is deliberately narrow: **borrow the
`featureList`, not the `offers` block** — and, on the evidence of this audit,
only publish feature strings that survive a claim audit first.

**5. Sell one thing per page.** The deeper structural lesson is that the POS
page works because it is a *product* page with one audience and one job, while
the main site is a *portfolio* page. The fix is not to cram four products into
one narrative; it is to give Shop, Plant, Website and Ecommerce each a page
like this one, and let the main site route to them. The showroom already
generates per-trade marketing copy
(`showroom/src/products/website/website-trade-brief.ts`) — the machinery to do
this at trade granularity partly exists in-repo.

The caution that goes with all five: this page's persuasive power comes from
concrete, checkable promises, and this audit found that five of its nine
promises do not fully hold. Borrowing the *form* without tightening the
*substance* would propagate the same problem to four more pages. The right
order is to fix the claims, then copy the format.

## Recommended fixes, cheapest first

1. **Re-save `spa-desk-pilot/src/lib/appConfig.ts` as clean UTF-8.** Four
   garbage navigation labels become real Burmese. An afternoon's work, and it
   is currently the most visible defect to the target customer.
2. **Add the `á€` mojibake signature to the encoding guard** at
   `tools/verify_app_build.mjs:6585` in this repo, and add an equivalent guard
   to the DeskPOS repo, which has none.
3. **Render `cloudSync.state` and `cloudSync.message` somewhere in
   `src/App.tsx`.** A silent backup failure becomes a visible one. This is the
   smallest change that defuses the most dangerous gap.
4. **Raise or remove the per-IP upload rate limit**, or debounce automatic
   sync to something a trading day cannot exhaust.
5. **Persist the cloud transfer code**, and surface the auto-sync pairing code
   using the already-written, already-tested `buildPairingCode` helper — so
   that automatic backup becomes restorable at all.
6. **Amend the page copy** for the claims graded PARTIAL above, or ship the
   missing behaviour. The payments sentence and the "ledger" word are the two
   with the clearest wording fixes; the self-booking sentence needs either a
   product change or removal of the word "self-booking."
7. **Resolve the pricing contradiction**, and if the answer is
   quote-per-customer, delete the `offers` block rather than hiding the figure.

## How to re-run this audit

The DeskPOS source is at
`C:/Users/thesw/Projects/supermega-workspace/spa-desk-pilot` (repo
`swanhtet01/supermega-workspace`, not this one). The Burmese proportions above
were measured by parsing `MODULE_COPY_MY_READABLE` and counting JSX text nodes
containing U+1000–U+109F; the encoding finding was confirmed by reading raw
bytes and round-tripping through CP1252, and by grepping the live deployed
bundle at `https://pos.supermega.dev/assets/` for the `á€` signature. Any
re-measurement should read files with an explicit UTF-8 decode rather than
relying on shell output, which mangles Myanmar script and will produce a false
mojibake reading on files that are actually clean.
