# Marketing positioning — claims grounded in shipped code

Status: first pass, 2026-08-18. Every claim below was traced to source before it
was written; the file that backs it is named so a reader can check it. Section
(e) is the do-not-say list and is binding on all outbound copy.

No prices appear here. Pricing is a founder decision and lives nowhere in the
product (`tools/test_capability_tiers.mjs:115-124` fails the build if an amount
reaches `capability-tiers.ts`).

---

## (a) Positioning thesis

SuperMega is for the Myanmar SME owner who already runs the business well in
their head and in a notebook, and whose real problem is not selling — it is
proving. It installs on the owner's own phone or laptop, needs no account, and
keeps working with the internet down (`showroom/public-app/sw.js` precaches the
app shell and serves it from cache when a fetch fails; all business records live
in the device's own storage, `core/local-workspace-storage.ts`). Every write it
accepts — a sale, a stock count, a refund, a booking, a shift close — carries
who did it, when, why, and what evidence backs it, and replaying the same action
returns the unchanged record instead of a second one (`CommerceActionProof` /
`ProductionActionProof`; the replay path is `{ ok: true, state: current,
replayed: true }` in `core/commerce-workspace.ts:4678` and
`core/production-workspace.ts:2137`). At close of day the counted drawer is set
against what the day says it should hold, per payment method, and a difference
cannot be saved without an owner and a reason (`core/commerce-workspace.ts`
~9536-9559). Those same evidenced events project into a double-entry journal
that refuses to emit at all if one entry does not balance
(`core/shop-ledger-journal.ts:442` control total, `:485` fail-closed
finalisation). A till is easy to find in this market. What no till here hands
the owner is the unbroken line from one tap at the counter to a balanced page an
accountant can check — with the records never leaving the owner's device.

**The one sentence.** Loyverse and Square give you a till and a report; a
notebook gives you a record only you can read. SuperMega gives you a till whose
every entry can be traced back to who made it and why, and whose month ends in a
balanced set of books — on your own device, free, with no account.

---

## (b) The permanence promise

Free is not a trial here. `showroom/src/core/capability-tiers.ts` names eleven
capabilities in `FREE_FOREVER`, and `tools/test_capability_tiers.mjs:49-62` is
a build gate: move any one of them out of `free` and the build fails with the
message "This already works on the owner's device with no account. Charging for
it now breaks what signup promised."

The guard also asserts tiers are **cumulative** (`:84-89`) — paying more never
removes anything — and that a locked capability still shows what it does, why,
and no pressure words: `upgrade`, `trial ends`, `expires`, `only`, `unlock now`
are all forbidden strings (`:107-112`).

### Free forever — the exact list, in the product's own words

| Capability | What the owner gets |
| --- | --- |
| `shop-counter` | Ring up a sale, take Cash, KBZPay or WavePay, and watch stock fall on its own. |
| `shop-inventory` | Track what you hold, get told before you run out, and count stock without stopping trade. |
| `shop-orders` | Hold an order, take payment, hand it over, and issue a credit note when something comes back. |
| `shop-appointments` | Book treatments against staff and rooms, with double-booking refused. |
| `shop-daily-close` | Count the drawer against what the day says it should hold, and keep the difference with its reason. |
| `shop-accounting-handoff` | Hand your accountant a balanced packet with the evidence behind every figure. |
| `plant-production` | Plan a batch, issue materials, record output and quality, and close the shift. |
| `website-builder` | Publish pages that describe your business and capture enquiries. |
| `ecommerce-storefront` | Show a catalog and take order requests into Shop for review. |
| `local-backup` | Take an encrypted copy of everything and put it back on any device. |
| `device-reset` | Erase everything on this device, with a restore point taken first. |

Two of those reasons are worth quoting to a sceptical owner verbatim, because
they are the argument:

- Daily close — "This is the step that makes your numbers worth trusting.
  Charging for it would be charging for honesty."
- Accounting export — "Your records are yours. Getting them out is never a paid
  feature."
- Backup — "Losing a business's records because it did not pay is not a business
  model."
- Reset — "Leaving is always free."

### The honest boundary

Three things sit above free, and the reason in each case is a real cost to us,
not a lever on the owner:

- **Reading orders out of messages** (`ai-order-intake`) — a model reads the
  message on our servers and that costs money per message. The *manual* version
  of the same screen is free and works with no account: paste a message, map
  each field, and every mapped field is held to an exact quote from what the
  customer actually wrote (`core/channel-order-intake.ts`,
  `core/ChannelOrderIntake.tsx:216-221` — with no managed identity the panel
  offers "Map manually" rather than hiding).
- **Automatic off-device backup** (`cloud-backup`) — we hold the storage.
  Manual encrypted backup (AES-GCM-256 with a PBKDF2-SHA-256 key from the
  owner's passphrase, `core/company-backup.ts:345-398`) stays free forever.
- **Shared records, staff sign-ins, independently verifiable statements**
  (enterprise) — these need a workspace we run and identities we manage. A
  record only proves something to a lender if someone independent holds it.

`ai-demand-advice` is listed as premium but its own copy says "Being designed"
— there is no implementation behind it. Do not sell it. The free reorder plan
that does exist is `core/shop-replenishment.ts`.

---

## (c) Ten trade cards

One per Shop starter template in
`showroom/src/products/shop/business-templates.ts`. Each ships a 12-20 item
catalog priced in MMK, exactly one item deliberately staged below its reorder
level, two or three sample counter sales, and one pending customer order with a
promise time (`validateShopBusinessTemplates`, `:599-651`). Sample activity is
time-shifted at install so the promise is ahead of the client, not overdue
(`rebaseWorkingSampleActivity`, `:75-95`). Sample rows carry the action-ID
prefix `ACT-DEMO-WORKING-SAMPLE-` (`core/commerce-workspace.ts:6414`) so they
are identifiable and replaceable — they never become the owner's real numbers.

---

### 1. Mini-mart & grocery — `mini-mart` · ကုန်စုံဆိုင်

**Daily pain.** Two hundred small lines, a dozen of them moving fast, and the
first time you learn the rice is gone is when a customer asks for it.

**Pitch.** "Your shelf tells you before your customer does."

**What backs it.** Every catalog row carries `reorderAt` alongside `onHand`;
`shopBusinessTemplateLowStockItems` surfaces the ones at or under the floor. The
free reorder plan (`core/shop-replenishment.ts`) turns those into a ranked list
with recommended order quantities, a suggested supplier and the next expected
arrival. It advises only — the plan's own `authority` block is
`purchaseCreated: false, supplierContacted: false, inventoryChanged: false`. It
never orders behind your back.

---

### 2. Pharmacy — `pharmacy` · ဆေးဆိုင်

**Daily pain.** An inspector or a clinic account asks who moved that stock and
on whose word, and the answer is a memory.

**Pitch.** "Every box in and out has a name, a time and a reason on it."

**What backs it.** Stock movements are not quantities, they are evidenced
events: each carries `actionId`, `capturedAt`, `actor`, `reason` and
`evidenceReference`, and a stock count records expected, counted and the
difference as one attributable record (`core/commerce-workspace.ts:3933-3934`,
`:8185-8216`). The pharmacy template also ships the clinic wholesale case — a
pending order for U Tun Lin at Shwe Clinic with a promise time and a handover
note — so a repeat trade account is set up before the owner types anything.

**Do not claim expiry or batch tracking for Shop.** It does not exist. See (e).

---

### 3. Phone & electronics — `phone-electronics` · ဖုန်းနှင့် အီလက်ထရွန်နစ်ဆိုင်

**Daily pain.** An office buys eleven items across three categories and wants
one document; two weeks later one charger comes back.

**Pitch.** "One order, one receipt — and a credit note when it comes back."

**What backs it.** Orders are multi-line with per-line SKU, quantity and unit
price; `ReceiptDialog.tsx` prints the whole acknowledgement as one document.
Returns and refunds are first-class: a refund cannot be recorded without the
complete settlement evidence set (`refundSettledAt`, `refundSettlementActionId`,
`refundSettledBy`, `refundSettlementReason`, `refundEvidenceReference` — all
five or none, `core/commerce-workspace.ts:3507-3513`), and the refund posts a
reversing entry in the ledger rather than an eraser.

---

### 4. Fashion & clothing — `fashion` · ဖက်ရှင်အထည်ဆိုင်

**Daily pain.** Medium white and large black are not the same thing and your
stock sheet treats them as "T-shirt".

**Pitch.** "Size and colour are separate lines, so your count is a count."

**What backs it.** The template's SKUs are size-level by design
(`TSHIRT-M-WHT`, `TSHIRT-L-BLK`, `JEANS-32`, `LONGYI-MEN` / `LONGYI-WMN`), and
`CommerceItem` carries an optional `variant` field that the counter search
matches on alongside name and SKU (`core/CoreApp.tsx:1054`). The staged pending
order is the trade's real money-maker: six black tees and six sock packs as a
uniform run for a tea-shop team, sizes confirmed by phone.

---

### 5. Hardware & construction supply — `hardware` · ဆောက်လုပ်ရေးပစ္စည်းဆိုင်

**Daily pain.** A foreman wants twenty bags of cement on site before the pour,
on the workshop's account, and you are owed from last month too.

**Pitch.** "Promise a delivery time, then see exactly who still owes you and how
late."

**What backs it.** Orders carry a fulfilment method (pickup or delivery) and a
promised time; the sample order is U Myint Soe's site delivery with a loading
note. Money owed is aged into `current / 1-7 / 8-30 / 31-60 / over 60` day
buckets with the most-overdue customer named
(`core/shop-ar-aging-summary.ts`), and a customer can carry a credit policy with
a limit, payment terms of 0, 7 or 30 days, and an active/hold status
(`core/shop-customer-credit-policy-summary.ts`).

---

### 6. Tea & coffee shop — `tea-coffee` · လက်ဖက်ရည်ဆိုင်

**Daily pain.** Twenty teas and twenty samosas for an 8:00 office meeting, taken
by phone yesterday, written on the back of a receipt.

**Pitch.** "Hold the collection slot, and the kitchen sees it before the
morning."

**What backs it.** The cafe industry pack renames the schedule to the trade's
own words — "Collections", "Hold a collection slot" — rather than showing a
generic appointment book (`core/shop-service-scheduling.ts:142`). Preorder
collection and catering consultation are bookable services that are *also*
catalog SKUs (`CAFE-SVC-COLLECTION`, `CAFE-SVC-CATERING`) so the slot can
actually be charged at the counter and reach the day's close — the appointment
book alone has no path to the ledger, and the code says so at
`business-templates.ts:480-489`.

---

### 7. Auto parts — `auto-parts` · ကားပစ္စည်းဆိုင်

**Daily pain.** A customer says "front brake pad, the Toyota one" and you are on
your knees in the back room while three people wait.

**Pitch.** "Type three letters or scan the box — the part and its price come up."

**What backs it.** The counter has a live search that matches item name, variant
and SKU together, with the field labelled "Search or scan SKU"
(`core/CoreApp.tsx:1054`, `:1132`). The template stocks the real spread from a
500 MMK fuse kit to a 175,000 MMK battery, and the staged pending order is a
workshop service job for two taxis invoiced under the workshop account — which
is where the credit limit and AR ageing above start earning their keep.

---

### 8. Restaurant — `restaurant` · စားသောက်ဆိုင်

**Daily pain.** A family of twelve books two tables together for Saturday, and
the only record is a name in a diary that the evening shift has not read.

**Pitch.** "A table held is a table with a deposit, a host and a written reason
behind it."

**What backs it.** The restaurant pack speaks reservations, not appointments —
"Reservations", "Hold a table" (`shop-service-scheduling.ts:161`) — with a host
and a table zone as bookable resources. The reservation deposit is a chargeable
SKU (`REST-SVC-DEPOSIT`). Bookings move `held → confirmed → checked_in →
completed`, each step appending an event with actor and reason
(`advanceShopServiceBooking`, `:457-469`), and a second booking on the same
table zone in the same window is refused outright (`:434-438`, re-checked in
`validateShopServiceSchedule:360-369`).

**Do not pitch counter speed here yet.** See (e).

---

### 9. Beauty spa — `beauty-spa` · စပါ အလှပြင်ဆိုင်

**Daily pain.** Two therapists, two rooms and one steam room, and the double
booking is only discovered when both customers are standing in reception.

**Pitch.** "Book the therapist and the room together. It will not let you
double-book either."

**What backs it.** The spa pack is the deepest in the file: seven treatments
with real durations (30 to 90 minutes) and seven resources — two therapists,
two treatment rooms, a steam room — each carrying a Burmese name
(`shop-service-scheduling.ts:185-200`). The end time is computed from the
service duration, not typed, and any overlap on the same resource is refused.
All seven treatments are also catalog SKUs (`SPA-SVC-*`), so a spa sells the
therapist-hour and the retail serum through the same counter and the same close.
The staged pending order is the bridal package: three treatments for three
people with two therapists held for the morning.

---

### 10. Bakery & patisserie — `bakery` · မုန့်ဖုတ်ဆိုင်

**Daily pain.** Counter trade all day, plus a birthday cake that must be ready
at 9:00 tomorrow and must not be sold to anyone else.

**Pitch.** "The cake is promised for nine o'clock, and the shop knows it."

**What backs it.** The bakery runs the cafe pack, so it gets collection slots
alongside the counter, and its staged pending order is Ma Ei Ei Phyu's daughter's
birthday — one 1kg cake, two cookie boxes, two loaves, collected at 9:00. The
promise time is validated as a real instant strictly after the request time
(`business-templates.ts:639-642`), so a promise the shop cannot have made will
not save.

---

## (d) Objection handling

### "My phone breaks, or the browser clears its data. Then what?"

Do not soften this: browser storage can be lost, and that is exactly why the
product ships its own answer instead of hoping.

Take an encrypted backup — one file, AES-GCM-256, keyed from a passphrase you
choose via PBKDF2-SHA-256, with an authenticated header so a tampered file fails
its integrity check and restores nothing (`core/company-backup.ts:308-321`,
`:345-445`). Restore it on any device. Restore is defensive: it takes the
workspace locks that the live app takes, and if any part of writing the backup
fails it puts the previous records back before it raises the error
(`core/local-workspace-backup.ts:95-118`). "Reset this device" takes a restore
point first (`LOCAL_WORKSPACE_RESTORE_POINT_KEY`), and the reset scope and backup
scope are deliberately held to the same key list so a key in one and not the
other is caught rather than lost silently (`core/local-workspace-storage.ts:57-64`).

The honest half: **manual backup is a habit you have to keep.** Automatic
off-device backup is the premium capability, and it is premium because we hold
the storage — not to make the free one worse.

### "Why should I trust a free thing?"

Because the free part costs us nothing to give you. It runs on your device, uses
no server of ours, and the module that defines the tiers says exactly that:
"Runs entirely on your device. It costs us nothing, so it costs you nothing."

And because the promise is enforced by machine, not by goodwill.
`tools/test_capability_tiers.mjs` fails the build if a free capability is moved
behind a tier. Its own comment names the failure it exists to prevent: "Nobody
would announce that; it would arrive as a one-word diff."

### "I already use a notebook and it works."

It does, for you. It stops working the day someone else has to read it — an
accountant at year end, a supplier disputing a delivery, a bank looking at your
trading, or your own staff on a shift you did not work.

The notebook cannot do three things this does. It cannot set the counted cash
against what the day should hold, per payment method, and force a reason onto the
difference. It cannot refuse to close when the arithmetic does not agree — the
journal will not emit at all if one entry's debits and credits differ
(`shop-ledger-journal.ts:442`, `:485`). And it cannot hand the accountant a CSV
where each line names the event it came from and that event's digest
(`LedgerSourceEvent` has no optional source field — a line with no source event
cannot be constructed, `shop-ledger-journal.ts:16-35`).

Also fair: keep the notebook for the first month. Nothing here needs the
notebook thrown away, and the starter catalog means the shop is running in
minutes rather than after a data-entry weekend.

### "You will paywall this later, once I depend on it."

That is the correct thing to fear, and it is the specific decision the code was
written to prevent. `FREE_FOREVER` lists eleven capability ids; the build gate
checks each one still sits in `free` and that paying more never *removes*
anything (tiers add, `test_capability_tiers.mjs:84-89`). Five product areas —
counter, daily close, accounting export, backup, device reset — must be named in
that list explicitly, so a new free capability cannot quietly ship paid-only
(`:60-62`).

And the exit is built, not promised: encrypted backup out, accounting CSV out,
catalog CSV out, then "Reset this device" erases everything. "Leaving is always
free" is the reason string on that capability.

---

## (e) What we may NOT claim yet

Binding. If a line is not in the product, it is not in the copy.

### Built but gated — say "gated", never imply live

1. **Hosted / managed mode.** Shared records, staff sign-ins with per-person
   limits, and independently verifiable statements are enterprise capabilities
   that need a workspace we run. `hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`
   is READY but unexecuted and founder-only. Say "we can run a managed
   workspace for a team — talk to us". Never "sign up and your branches sync".
2. **Premium is not purchasable today.** `premiumUnlocked` exists in
   `capability-tiers.ts` with no grant, billing or entitlement mechanism behind
   it (`hq/strategy/BILLING-RAIL-DESIGN.md` §1 states this as the open gate).
   There is no checkout, no plan page, no self-serve upgrade. All premium and
   enterprise copy must end in a conversation, which is exactly what
   `lockedCapabilityNotice` already does: action = "Talk to us about this".
3. **AI order intake** requires a managed identity. Free users get the manual
   mapper. Do not show the AI path in free-tier marketing without saying it
   needs an account with us.
4. **Billing and entitlement transitions are founder actions** via the billing
   CLI. Never imply automated invoicing, automated activation, or card payment.

### Designed but not built — do not sell at all

5. **`ai-demand-advice`.** Its own outcome string starts "Being designed".
   There is no implementation. Not in a deck, not in a demo.
6. **Expiry, batch and lot tracking in Shop.** Does not exist. `CommerceItem`
   has sku, name, variant, onHand, reorderAt, price — no expiry, no lot. The
   pharmacy sample order's note about confirming gauze batch dates is a *human
   note on an order*, not a tracked field. `client-capability-plan.ts` lists
   "lots, expiry" as a roadmap item; that file is a plan, not a product.
   Material lots and recall traceability **do** exist in Plant
   (`buildProductionBatchGenealogy`, `buildProductionCertificateOfConformance`,
   `production-workspace.ts:3040-3080`) — do not migrate that claim to Shop.
7. **Multi-branch, multi-location, multi-device sync.** Free is one device. Say
   so plainly.

### Real but narrower than the words suggest — fix the words

8. **"Online storefront" is not on the internet yet.** The storefront is a
   preview surface inside the app and its order requests are typed
   `mode: 'browser-local-request'`
   (`products/ecommerce/storefront-request.ts:26`). There is no public URL for a
   free storefront. Correct wording: "a storefront view you can show a customer,
   whose order requests land in Shop for your review". Wrong wording: "your
   customers can visit your online shop". The `ecommerce-storefront` outcome
   string in `capability-tiers.ts` currently reads "Show a catalog online",
   which over-reaches — flagged for the founder as a copy fix, not a code fix.
9. **"Publish" in Website means check and download.** `PublishWorkspace.tsx`'s
   own heading is "Check and download the site" and the artifact is a
   self-contained HTML file (`website-export.ts:422`). We do not host it, do not
   register a domain, do not push to a domain — `domain_publish` is on the
   managed-mode forbidden list (`core/managed-context.ts:13-22`). Say "build a
   site and take the file to any host". Never "we put your site online".
10. **Receipts print in English.** `ReceiptDialog.tsx` hardwires `lang="en"`;
    dynamic receipt language is queued as design phase 2 item 6. Burmese support
    today is real but partial: Burmese trade and service names ship in the
    templates and industry packs, and Burmese script typography is enforced
    (system Myanmar faces in the stack, `:lang(my)` line-height 1.65,
    `core/core-app.css:2444-2451`). Say "Burmese names and Burmese script render
    properly". Do not say "the app is in Burmese".
11. **Counter speed is not our claim yet.** The design tribunal's own finding:
    a cash sale is currently five modals across two tabs where Loyverse does
    three taps (`hq/strategy/DESIGN-PROGRAM.md`, phase 2 item 1 — the one-tap
    cash sale is queued, not shipped). Until it ships, never pitch SuperMega on
    counter speed, and never compare tap counts. Pitch evidence, close and
    handoff — where we are actually ahead.
12. **Recommendations do not act.** The replenishment plan and the Plant
    material requirements both carry an explicit `authority` block of all-false
    flags — no purchase created, no supplier contacted, no inventory moved, no
    provider called (`shop-replenishment.ts`, `production-material-handoff.ts`).
    This is a selling point, not a limitation: say "it tells you; you decide".
    Do not say "it reorders for you".
13. **Guided samples prove nothing about the business.** A guided Ecommerce
    request stops at `pending_shop_review`; a guided Plant shift releases no
    batch; a guided Website sample publishes and approves nothing. Never present
    sample numbers as a customer's results, and never present a screenshot of
    seeded data as a case study.

### Never, under any framing

14. No invented statistics, no percentages, no "shops using SuperMega saw…".
    There is no measured customer base to quote.
15. No testimonials, named customers, or logos that do not exist. The sample
    names in `business-templates.ts` (Daw Khin Aye, U Myint Soe, Ma Ei Ei Phyu)
    are fixtures. They are not customers and must never appear as quotes.
16. No pricing, in any currency, in any channel, until the founder sets it.
