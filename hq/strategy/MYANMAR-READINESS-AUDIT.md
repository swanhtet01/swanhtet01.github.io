# Myanmar readiness audit — what stands between this app and a Yangon shop owner

Traced against `origin/main` @ **`6647a2b2`** (PR #551, 2026-08-23). Audit
only: this document changes no product code.

**The question.** Not "is the app good", and not "what features are missing".
One question: *what stands between this app and a shop owner in Yangon running
her whole day on it, in Burmese, on the phone she already owns?* Everything
below is ranked by how far it moves her from "interesting" to "I use this every
day", and every claim is traced to a file and a line.

**Method.** Source wins over documents. Four claims in this repo's own strategy
docs turned out to be stale or wrong when checked against the tree; they are
corrected in §8 rather than repeated. Every Burmese string quoted here is
copied from an existing source file with its line cited. Nothing here proposes,
glosses or invents a Burmese string, including in examples.

**A note on the tree.** This audit was briefed against a checkout that was 150
commits behind. Re-grounding on `6647a2b2` changed real numbers: the app's
string-attribute surface grew from **445 sites to 461** in that window
(measured, §2.1), so any count taken from the pre-#546 tree is now low. The
Spa vertical, the company-portal chrome, the signup product chooser and the
local-backup capacity warning all landed inside it, and all four are operator
surfaces.

---

## 1. The ranked answer

Ranked by adoption impact. The **Gate** column is the one to read first: it
separates work that needs a person to *decide or sign something* from work that
is only engineering.

| # | Finding | What it costs her today | Cost to fix | Gate |
| --- | --- | --- | --- | --- |
| **1** | **The BILINGUAL product name has no owner path** — corrected 2026-08-26, see §2.5. A Burmese-only name is writable *today*: `Item name` (`CoreApp.tsx:2983`, `:2992`, `:7275`) is unrestricted free text with no `pattern`, and renders as `item.name` on the counter and receipt. What has no owner path is the English+Burmese PAIR. Provisioning does write `nameMy`, for rows that sell a bookable service. | She can type ဆန် today and it shows. What she cannot do is keep the English name *and* the Burmese one — so a shop wanting both, or a staff member who reads only one, is stuck. Not "English permanently". | S–M engineering **after** a policy reversal | **Founder** — `product-onboarding-runtime.ts:377` states the CSV *must not* grow a Burmese column. That decision has to move first. |
| **2** | **7 of 53 `bi()` call sites render Burmese today**, and the distribution is inverted against shift order: signup 0, onboarding 0, work-mode bar 0, counter 2, receipt 1, Stock 0, Today 0, close 0. | She works through four entirely English surfaces before the first bilingual word, and two of the four Shop work modes (Today, Stock) have none at all. | Split: 28 already-signed-off verbs need only wiring; 40 wired strings need only sign-off | **Both, but cleanly separable** — see §2.3. The 28 are pure engineering. |
| **3** | **Numeral script is split and device-dependent.** `formatMoney` is pinned to `en-US`; **200** other call sites use bare `toLocaleString()` and follow the phone. | On a Burmese-locale phone the counter renders a total in Arabic digits and the receipt for that same sale renders it in Burmese digits. Two scripts, one sale. | S engineering once decided | **Founder** — which script wins is a decision with a native input. §3. |
| **4** | **Non-cash reconciliation is entirely manual, and the payment method list is a hardcoded three.** `['Cash', 'KBZPay', 'WavePay']`, inline at `CoreApp.tsx:1352`. | A shop taking AYA Pay, CB Pay, MPU or bank transfer has nowhere to put it, so its per-method daily close is wrong by construction. | S engineering for an owner-editable list; the reconciliation gap is by design | **Founder for scope, engineering for the list.** §4. |
| **5** | **There is no Burmese customer receipt**, and the printed artifact declares `<html lang="en">` with no Myanmar face in its print font stack. | Her customer gets an English slip. Loyverse prints Burmese. | M — a new artifact, not a wrapper | **Founder** — source already names this as roadmap work needing its own pass. §5. |
| **6** | **First visit is ~4.0 s to first paint on a throttled low-end profile, plus a 522 KB install-time precache the measured baseline never saw.** The baseline predates the service worker by one day. | First impression is four seconds of white screen. Repeat-visit performance is **unmeasured**, not merely unreported. | Measurement first (S), then unknown | **Engineering** — but the measurement must be redone. §6. |
| **7** | **The storage/backup wall speaks only English, in concatenated prose `bi()` cannot reach, on a page excluded from the precache.** | The most consequential sentence in a device-local product — "there is no file that can put this device back the way it is now" — is unreadable to a Burmese-first owner. | M — needs a different mechanism than exact-match | **Both.** §7. |
| **8** | **The monthly statement computes Burmese account names and renders none of them.** | Four already-confirmed Burmese words she would recognise are dropped on the floor. | **XS** — one JSX span | **Engineering only.** Cheapest item in this document. §2.4. |

**What is already fine** is in §0, and it is a longer list than §1. The
foundation here is genuinely good; the gap is distribution and decision, not
architecture.

---

## 0. What is already fine — say it plainly

Padding this document would make it less useful. These were checked and need no
work:

- **Font stack.** `core-app.css:2496` puts `"Noto Sans Myanmar", "Myanmar
  Text", Padauk` in the body stack and `:lang(my)` gets `line-height: 1.65`
  (`core-app.css:2497`). **No webfont is downloaded** — grep for `@font-face`
  and `fonts.googleapis` across `showroom/src` and `index.html` returns
  nothing. On a slow connection that is exactly the right call, and the
  mirrored rules exist in `website-product.css:3508` and
  `ecommerce-product.css:1885`.
- **Address shape is Myanmar-correct.** `line1 / township / city` with `city`
  defaulting to `'Yangon'` (`EcommerceBuyingWorkspace.tsx:161-163`), not
  street/state/ZIP.
- **Phone shape works.** `placeholder="e.g. 09 123 456 789"`,
  `inputMode="tel"`, and a validator accepting 6–15 digits with an optional
  `+` (`ecommerce-buying-lifecycle.ts:811`, `:1013`) — `09xxxxxxxxx` and
  `+959xxxxxxxxx` both pass.
- **Time zone is right and pinned.** Business date is computed as
  `Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' })`
  (`CoreApp.tsx:779`, `:5373`, `SettingsPage.tsx:485`; `CoreApp.tsx:6549` uses
  `en-CA` with the same zone) — an ISO day in Yangon local time, not UTC. A shop
  closing at 21:00 local is not filed against the previous day.
- **Barcode scanning targets the right hardware.** `BarcodeScanButton.tsx`
  builds on the platform `BarcodeDetector` with no library, explicitly because
  "Chromium/Android — the phone hardware Myanmar counters actually run"
  (`BarcodeScanButton.tsx:5-8`), detects on a 400 ms interval rather than per
  frame for low-end CPUs (`:26`), and falls back silently to the keyboard-wedge
  path where the API is absent. This is well-reasoned for the device.
- **The offline precache now covers the till.** Verified by building this
  tree: 45 URLs, 1.91 MB raw / **522 KB gzipped**, and
  `/assets/core-app-*.js` is in the list. See §8 — the roadmap still says
  otherwise.
- **Payment-QR scoping is safe.** Records are keyed `[scope, method]` so a
  second merchant on the same browser cannot be shown the first merchant's QR
  (`payment-qr-store.ts:52-62`). That is a real money-path hazard, closed.
- **The register the drafts follow is documented and consistent.** The
  `sourced:` convention in `i18n-actions.ts` ties new drafts to Burmese nouns
  the app already ships, which is the cheapest possible thing for a native
  reviewer to check.

---

## 2. The Burmese operator surface, in shift order

### 2.1 The surface grew, and the existing census is now low

Measured with one method across three revisions (attribute sites —
`aria-label` / `placeholder` / `title` / `alt` — in `showroom/src/**/*.tsx`):

| Revision | Total | Static | Dynamic |
| --- | --- | --- | --- |
| `4a55916b` (the G1 census baseline) | 445 | 355 | 90 |
| `b55ef1ad` (PR #545) | 445 | 355 | 90 |
| **`6647a2b2` (HEAD)** | **461** | **369** | **92** |

This method reproduces `G1-STRING-MECHANISM-DECISION.md` §2.2's figure of 446
to within one site at the same commit, so the +16 is a real delta, not a
methodology difference. It lands as **+8 in `CoreShell.tsx`** (the new
company-portal chrome), **+5 in `CoreApp.tsx`**, **+1 each** in
`ShopServiceSchedule.tsx` and `WebsiteProduct.tsx`.

The eight new `CoreShell` sites are the first chrome any owner meets:
`aria-label="Company login"`, `aria-label="Active company"`,
`title="Company products"`, `title="Switch product"`, `title="No products
assigned"`, `title="Product access needs attention"`, `title="Opening company
portal…"`, `aria-label="Shop task shortcuts"` — with visible siblings
`Company portal`, `Free trial`, `Login`, `Switch`, `Sign in again`,
`Switch company`. **None of them is in the translation table.**

### 2.2 What actually renders Burmese today — 7 sites, 5 words

Measured by resolving every `bi('literal')` call site against
`ACTION_TRANSLATIONS`:

- Table: **93 keys — 33 `confirmed`, 60 `pending_native_review`.**
- Call sites: **53** `bi('literal')` occurrences (plus 3 with a computed
  argument, which resolve to table keys at runtime).
- **Rendering Burmese today: 7 call sites, 5 distinct keys.**

| Key | Burmese | Source | Where it renders |
| --- | --- | --- | --- |
| `Cancel` | `ပယ်ဖျက်မည်` | `i18n-actions.ts:36` | `CoreApp.tsx`, `SettingsPage.tsx` |
| `Close` | `ပိတ်မည်` | `i18n-actions.ts:40` | `PaymentQr.tsx`, `ReceiptDialog.tsx` |
| `Open` | `ဖွင့်မည်` | `i18n-actions.ts:41` | `SettingsPage.tsx` |
| `Back` | `နောက်သို့` | `i18n-actions.ts:49` | `SettingsPage.tsx` |
| `Clear` | `ရှင်းလင်းမည်` | `i18n-actions.ts:67` | `CoreApp.tsx` |

This exactly reproduces `G1-STRING-MECHANISM-DECISION.md` §3.1a's enumeration,
which is therefore **still accurate on HEAD** — a rare thing in this repo's
docs and worth recording as such.

The remaining **40 called keys are drafted but `pending_native_review`**, so
`bi()` returns plain English (`i18n-actions.ts:205-209`). Wiring and sign-off
are genuinely separate tracks, exactly as the mechanism decision intends.

### 2.3 The shift-order table — this is the finding

Ranked by when a cashier meets a surface during one real day, not by file.
`bi` = `bi('literal')` call sites in that file; `MY` = how many of them render
Burmese today; `text`/`attr` = a crude but consistent census of visible JSX
text nodes and visible-text attributes.

| When | Surface | File | bi | **MY** | text | attr |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Sign up | Trial signup + product chooser | `SignupPage.tsx` | 2 | **0** | 21 | 5 |
| 2. Sign in | Company login | `ManagedLoginPage.tsx` | 4 | **0** | 22 | 5 |
| 3. Set up | Product onboarding | `ProductOnboardingPage.tsx` | 0 | **0** | 9 | 3 |
| 4. Every screen | Shell, portal chrome, bottom nav | `CoreShell.tsx` | 1 | **0** | 17 | 12 |
| 5. Open of day | Today | `ShopToday.tsx` | 0 | **0** | 9 | 2 |
| 6. **All day** | **Counter (Sell)** | `CoreApp.tsx` | 17 | **2** | 622 | 118 |
| 7. Non-cash sale | Merchant QR dialog | `PaymentQr.tsx` | 3 | **1** | 4 | 0 |
| 8. Every sale | Receipt dialog | `ReceiptDialog.tsx` | 13 | **1** | 0 | 0 |
| 9. All day | Stock | `ShopInventoryFoundation.tsx` | 0 | **0** | 42 | 4 |
| 10. Appointments | Service schedule + Spa privacy | `ShopServiceSchedule.tsx` | 0 | **0** | 49 | 6 |
| 11. Close of day | Monthly statement | `ShopMonthlyStatement.tsx` | 0 | **0** | 19 | 6 |
| 12. Occasional | Settings + merchant QR upload | `SettingsPage.tsx` | 13 | **3** | 177 | 41 |
| 13. Emergency | Backup / storage wall | `WorkspaceControlsPage.tsx` | 0 | **0** | 119 | 19 |

Three things fall straight out of this table and out of nothing else:

1. **The first four surfaces she meets are 100% English.** Everything before
   the counter — signup, login, onboarding, shell — renders zero Burmese. The
   counter slice was the right place to *start*, but adoption is decided
   before she reaches it.
2. **Two of the four Shop work modes have no `bi()` at all.** Today and Stock
   are 0/0 — `commerce-tabs.ts:10-15` has table entries for the tab *labels*
   (`Today` → `ယနေ့`, `i18n-actions.ts:129`; `Stock` → `ကုန်ပစ္စည်း`,
   `:132`), both pending, but the screens behind them are untouched.
3. **`ShopServiceSchedule.tsx` grew 49 visible strings and 0 `bi()` calls**,
   including the whole Spa privacy and membership surface that landed in
   PR #546. It is a new cashier-facing vertical shipped entirely in English
   after the G1 census was taken.

### 2.4 The cheapest work in this document: 28 signed-off verbs with no call site

**48 of the 93 table keys are never called from anywhere. 28 of those 48 are
`confirmed`** — a native speaker has already signed them off and they render
nowhere.

Ten of the 28 exist right now as **exact JSX text** somewhere in the app, which
means wrapping them costs one function call each and needs no review and no
decision — with one caveat, immediately below the table:

| Key | Burmese (source) | Live sites | Where |
| --- | --- | --- | --- |
| `Edit` | `ပြင်ဆင်မည်` (`:48`) | 6 | `ShopInventoryFoundation.tsx:606,614,623`, `PlantOrderFoundation.tsx`, `ContentWorkspace.tsx` |
| `Remove` | `ဖယ်ရှားမည်` (`:43`) | 5 | `CoreApp.tsx:6806`, `PaymentQr.tsx:126`, others |
| `Reorder` | `ထပ်မံမှာယူမည်` (`:61`) | 3 | `CoreApp.tsx`, `EcommerceBuyingWorkspace.tsx` |
| `Next` / `Previous` | `ရှေ့ဆက်မည်` / `ယခင်` (`:50`, `:51`) | 3 | `CoreApp.tsx:7790,7792` (order pager) |
| `Return` | `ပြန်ပို့မည်` (`:65`) | 2 | `CoreApp.tsx:7744`, `EcommerceBuyingWorkspace.tsx` |
| `Download`, `Start`, `New`, `Record` | `:45`, `:63`, `:68`, `:47` | 6 | `WebsiteProduct.tsx`, `ProductSystemNavigator.tsx`, `AgentTeamsPanel.tsx` |

**A trap, named so nobody walks into it.** Two of those "live" hits are *not*
buttons. `CoreApp.tsx:7140` and `:7147` use `Reorder` as a **column header**
meaning the reorder point, and `:7744` uses `Return` as an eyebrow label, not
an action. The confirmed table is deliberately verb-shaped —
`ထပ်မံမှာယူမည်` means *will order again* — so exact-match would cheerfully
gloss a noun-shaped table header with a verb. **Wire the buttons; leave the
headers.** That reduces the free set to roughly **7 real control sites on the
Shop path** (`Edit` ×3, `Previous`/`Next` ×2, `Remove` ×2).

**§8 item 8 belongs here too.** `shop-monthly-statement.ts:138` copies
`account.nameMy` onto every cash-and-wallet balance row, and
`ShopMonthlyStatement.tsx:66` renders `{account.name}` and nothing else. Four
confirmed Burmese account names — `ငွေအံ` (cash drawer),
`KBZPay ပိုက်ဆံအိတ်`, `WavePay ပိုက်ဆံအိတ်`, `အခြား ငွေလက်ခံ`
(`shop-ledger-accounts.ts:64-67`) — are computed and discarded. One JSX span
puts them on the owner's monthly close. **This is the single cheapest Burmese
win in the app.**

### 2.5 The Burmese product name — rank 1, and it is a policy question

The counter has a real, well-built slot for a Burmese product name. The tile
renders `item.nameMy` inside `<small className="shop-product-my" lang="my">`
(`CoreApp.tsx:1329`), the cart line repeats it (`:1342`), and the tile's
accessible name references the node so the Burmese survives
(`CoreApp.tsx:1325`).

**No form can write it — but that is not the same as "no Burmese".**
Corrected 2026-08-26 after review; the first version of this section said
"nothing in the app can write it", which overstates the blocker in a way that
changes what to build. Two things are true at once and the ranking depends on
keeping them apart:

- **A Burmese-ONLY name is writable today.** `Item name` (`CoreApp.tsx:2983`,
  `:2992`, `:7275`) is unrestricted free text — no `pattern` attribute, no
  charset guard — and whatever is typed renders as `item.name` on the tile, the
  cart line and the receipt. An owner who is content to run a Burmese-only
  catalog can do so this afternoon, with no engineering and no policy change.
- **The bilingual PAIR is what has no owner path.** Nothing lets an owner keep
  `Rice 5kg` *and* `ဆန်` on the same row. That is the actual gap, and it binds
  on a shop that wants both — a mixed-literacy staff, or an owner who reads the
  English SKU sheet but whose cashier does not.

So the honest headline is *"cannot be bilingual"*, not *"is English
permanently"*. `nameMy` appears in exactly four `.tsx` files and is read in all
four; no form field anywhere sets it. Its only producer is
`withShopServiceMyanmarNames` (`shop-service-scheduling.ts:847`),
which pairs catalog rows to the six industry packs' **bookable services**. A
row it cannot pair to a service "is returned exactly as it arrived"
(`:840-842`).

The consequence, traced:

- `business-templates.ts` — the ten trade templates a Myanmar shop actually
  picks (mini-mart, pharmacy, phone-electronics, fashion, hardware, tea-coffee,
  auto-parts, restaurant, beauty-spa, bakery) — contains **zero** occurrences
  of `nameMy`.
- Both provisioning paths (`product-onboarding-runtime.ts:351`, `:389`) run
  `withShopServiceMyanmarNames`, so a mini-mart gets Burmese on the two
  `RETAIL-SVC-*` service rows and on nothing else. Rice, oil, soap, coffee:
  English forever.
- The catalog item forms (`CoreApp.tsx:2983`, `:2992`, and the Stock tab's at
  `:7275`) each take six fields — SKU,
  Item name, Opening stock, Reorder at, Price, and the accountable reason /
  reference. There is no Burmese name field.
- `commerce-workspace.ts:56-60` states the policy directly: *"Retail goods
  have no Myanmar name anywhere in this codebase and must not be given
  machine-made ones."* And
  `product-onboarding-runtime.ts:377` states the import policy: *"The CSV has
  no Burmese column and must not grow one."*

**The only workaround makes things worse.** She can of course type Burmese
into the free-text `Item name` field. But `name` is snapshotted onto every
order line and printed on receipts (`commerce-workspace.ts:50-51`), so doing
that gives up the English half on the order record, gives up the `lang="my"`
typography, and leaves the purpose-built `nameMy` slot empty.

**Correcting a source comment.** `CoreApp.tsx:1289` describes `item.nameMy` as
"the Burmese product name the owner typed in themselves." As of `6647a2b2`
that is not true of any path in this repo — there is no form that writes it.
The comment is aspirational; `commerce-workspace.ts:56-60` is accurate.

This is **rank 1** because it is the highest-frequency Burmese a cashier would
read — she reads a product name on every single line of every single sale —
and because the block is a stated policy, not a missing feature. **Founder-
gated first, engineering second.**

### 2.6 There is no language mode, and that is a decision worth restating

Grep finds no locale selector, no `setLocale`, no locale context anywhere in
`showroom/src`. `index.html:2` is `<html lang="en">`. `bi()` composes English, a middle dot, then the Burmese inside
`<span lang="my">` (`i18n-actions.ts:208`) — on a shipped confirmed entry that
is `Close · ပိတ်မည်` (`i18n-actions.ts:40`) — and there is no other mode.

That is Option B working as designed — the reviewed unit is exactly what the
operator meets. But state its cost plainly: **even fully signed off, the till
never becomes a Burmese till.** Every label roughly doubles in width, in an app
whose tightest surface is a five-across bottom bar at 375 px — which is why
`.bi-label` had to be introduced at all (`i18n-actions.ts:197-204`). Whether a
Burmese-first cashier wants a bilingual composite or a Burmese-only mode is a
**founder decision with a native input**, and it is upstream of how much of the
remaining 40 pending strings are worth confirming.

---

## 3. Numerals, dates, money — what it currently does, precisely

The i18n table header states the convention: *"Burmese numerals over Arabic
digits"* (`i18n-actions.ts:26`), and the data layer honours it —
`shop-service-scheduling.ts:155` ships `'အရောင်းဝန်ထမ်း ၁'`.

**What the app actually renders is split, and the split is device-dependent.**

| Helper | Source | Locale | Renders |
| --- | --- | --- | --- |
| `formatMoney` | `CoreApp.tsx:830-832` | **`'en-US'` pinned** | Always Arabic, then a literal ` MMK` |
| `mmk` (receipt) | `ReceiptDialog.tsx:18-20` | **none — follows the device** | Burmese digits on a Burmese-locale phone |
| `formatReceiptDate` | `ReceiptDialog.tsx:7-16` | `'en-GB'` pinned | Always English |
| `formatTime` | `team-work.ts:536-538` | `'en'` pinned | Always English |
| `formatIssueDue` | `CoreApp.tsx:783-785` | `'en'` pinned | Always English |
| Business date | `CoreApp.tsx:779` | `'sv-SE'` + `Asia/Yangon` | ISO day, correct |
| Stock counts | `CoreApp.tsx:1329` — `` `${item.onHand} in stock` `` | n/a — raw interpolation | Always Arabic |

Measured on this environment's ICU:

```
// 12345 is an arbitrary integer used to probe the formatter — not a price.
new Intl.NumberFormat('en-US').format(12345)  →  12,345
(12345).toLocaleString()                      →  12,345   (this container's default)
(12345).toLocaleString('my-MM')               →  ၁၂,၃၄၅
Intl.NumberFormat('my-MM').resolvedOptions().numberingSystem  →  mymr
```

`my` and `my-MM` resolve to the `mymr` numbering system, so bare
`toLocaleString()` produces **Burmese digits** on a phone whose browser
language is Burmese.

**Census of the exposure:** `showroom/src` contains **200 bare
`toLocaleString()` call sites** (73 in `CoreApp.tsx` alone, 22 in
`PlantOrderFoundation.tsx`, 8 in `ShopInventoryFoundation.tsx`, 5 in
`local-workspace-backup.ts`, 3 in `ReceiptDialog.tsx`) against **2** with an
explicit locale and **one** `Intl.NumberFormat`, which is `formatMoney`.

So on a Burmese-locale phone this app renders **both numeral scripts at once**,
and which one a given number gets depends on which helper the developer reached
for. The counter total and the receipt total for the same sale disagree.

**This corrects `G1-STRING-MECHANISM-DECISION.md` §4.5**, which states: *"every
number the counter interpolates comes from `formatMoney` or `toLocaleString`
and is Arabic."* The `formatMoney` half is right; the `toLocaleString` half is
wrong — bare `toLocaleString()` is not Arabic on a Burmese-locale device. The
doc's *conclusion* still stands and is arguably strengthened: a reviewer cannot
sign off `{n} in stock` without knowing which numeral arrives, and now the
honest answer is "it depends on the phone".

**Gate: founder, then mechanical.** The decision is one line — which script,
everywhere. Once made, pinning 200 sites through one shared helper is
ordinary engineering. Note that this decision also reaches the printed receipt
and is therefore coupled to §5.

---

## 4. Payment reality — what she does manually for one KBZPay sale

Traced end to end. The merchant QR is display-only by design and correctly so
(`payment-qr-store.ts:11-19` — no payment API, no network call, no automated
reconciliation). This section measures the **cost of that boundary**, which is
a real adoption cost whether or not the boundary is right.

**One non-cash sale, today:**

1. Cashier rings items, taps a method. The method list is a **hardcoded inline
   array** — `['Cash', 'KBZPay', 'WavePay']` at `CoreApp.tsx:1352`.
2. For any non-cash method the counter renders `PaymentQrButton`
   (`CoreApp.tsx:1358`).
3. If a QR is stored for `[scope, method]`, she taps
   `Show {method} QR · {amountDue}` (`PaymentQr.tsx:62`). If not, she gets a
   pointer to Settings (`PaymentQr.tsx:58`).
4. The dialog shows her own static QR and the amount. **The customer types the
   amount into their own banking app themselves** (`PaymentQr.tsx:70`).
5. She **looks at the customer's phone** to see the confirmation screen.
   Nothing in the app reads it, and nothing can.
6. She taps *Review order* → the counter confirmation gate → the order is
   created and stock reserved. **Payment stays `pending`.**
7. In Orders she taps Settle (`settleSale`, `CoreApp.tsx:4385`). The
   accountable gate opens with reason and reference **pre-filled**
   (`"KBZPay received and the customer took the order."` / `"Order <ref>"`,
   `CoreApp.tsx:4406-4407`); she types her name and submits. One command
   composes the reconcile plus three fulfilment advances.

**So the honest measure of the manual cost is:** one extra dialog open, one
visual check of a stranger's phone screen, and one settle confirmation with a
typed name. That is *light* — the pre-filled reason and reference do real work
here, and this is better than it is usually described.

**Two gaps that are not light:**

- **No wallet transaction reference is captured.** The evidence reference
  defaults to the order reference. A disputed KBZPay payment leaves no
  wallet-side identifier in the accountable record unless the cashier
  overwrites the prefilled field by hand. For a shop reconciling against a KBZ
  statement at month end, that is the field that matters.
- **The three-method list is the bigger problem — but it is the COUNTER's
  problem, not the app's.** Corrected 2026-08-26; the first version of this
  bullet overstated it and the correction matters, because it changes what to
  build. `PAYMENT_QR_METHODS` is fixed at `['KBZPay', 'WavePay']`
  (`payment-qr-store.ts:79`) and the walk-in counter offers exactly three
  buttons, with no owner-editable method list anywhere.

  What is **not** true is that every other tender is forced into those three.
  The manual-order form offers `Card` (`CoreApp.tsx:6814`), and Website order
  intake offers `manual_bank_transfer`, recorded as `Manual bank transfer`. And
  the close does **not** settle against a fixed three: it groups dynamically by
  each order's own `payment` value (`CoreApp.tsx:1773-1781`, keyed through a
  `Map`), so a card or bank-transfer sale lands in its own row and the
  per-method variance stays intact.

  So of the five tenders originally listed, **MPU card and bank transfer
  already have a path** — just not from the walk-in counter. The genuine gap is
  narrower and worth naming exactly: the three fixed counter buttons, and the
  unsupported wallet BRANDS (AYA Pay, CB Pay, OK Dollar), which have no route
  anywhere and must still be mis-recorded as one of the three. That is a real
  till-balancing problem for a shop taking those wallets; it is not an app-wide
  absence of card or bank-transfer recording.

**Gate:** the reconciliation boundary is a **founder** scope question (and the
current answer is defensible). The **owner-editable method list is engineering
only**, and it is small — the list is two literals and a fixed-key store.

---

## 5. The receipt — no Burmese, by design, and it is stated in source

`ReceiptDialog.tsx:25-41` is explicit and honest: what prints is the order
**acknowledgement artifact**, not a customer slip; its field names are the
record's own vocabulary; it carries the confirmation action id and document
digest; it "stays one language and the printed document declares that language
honestly on its root element". That root element is `<html lang="en">`
(`ReceiptDialog.tsx:129`), and the print stylesheet sets
`font-family: ui-monospace, 'Courier New', monospace` (`:108`) — **no Myanmar
face in the print stack at all**, so even an owner-typed Burmese product name
would fall to a browser default on paper.

The file then names the gap itself: *"The customer-facing Burmese slip a
Loyverse user is comparing against is a separate artifact this app does not
have yet … That is roadmap work with its own planning pass."*

Nothing to correct here — the source is accurate about its own limits. What the
audit adds is the **ranking**: this is #5, above the storage wall and below the
numeral decision, because the competitor named in
`ERP-COMPETITIVE-ROADMAP.md:301` — Loyverse — specifically ships Burmese
receipt printing, and a customer-facing slip is the artifact a shop's own
customers judge.

The on-screen receipt dialog is better placed: 13 `bi()` sites already wired
(`ReceiptDialog.tsx:187-234`) with drafts for `Order record`, `Subtotal`,
`Discount`, `Delivery`, `Tax`, `Total`, `Paid`, `Payment pending`,
`Points redeemed`, `Points balance`, `Print receipt`, `Copy text`. **All
pending review except `Close`.** Twelve sign-offs turn the whole on-screen
receipt bilingual with no code change.

---

## 6. The device — what the measured baseline does and does not say

`ANDROID-PERFORMANCE-BASELINE.md` is a good document and its numbers are
real: median of 3 cold loads, Galaxy A13 profile, CPU ×6, 400 kbit/s,
400 ms RTT.

| Route | FCP | JS transfer (gz) | Long-task total |
| --- | --- | --- | --- |
| `/` → Shop counter | 3,940 ms | 415 KB | 1,412 ms |
| `/shop/?tab=counter` | 4,088 ms | 415 KB | 1,767 ms |
| `/shop/?tab=orders` | 4,100 ms | 424 KB | 2,031 ms |

**What that means for a Yangon owner, stated plainly:** roughly **four seconds
of blank screen** on first open, because `index.html` paints nothing.

**Corrected 2026-08-26 — the mechanism above was wrong, and it was wrong in a
way that would have misdirected the fix.** The first version of this paragraph
said first paint "waits for the entry chunk plus the eagerly-imported model
chunks", then blamed a **serial critical path**. Both reproduce a claim
`ANDROID-PERFORMANCE-BASELINE.md:179-192` had already withdrawn by direct
measurement: `jsTransferBeforeFcpBytes` returns **91.3 KB gz on all seven
routes, identically** — the four HTML-discoverable files only. *"No dynamically
imported chunk — not `core-app`, not `commerce-model`, not the route chunks —
is on the first-paint path on any route… There is no waterfall to flatten."*

So FCP is set by one HTML round-trip, plus 91 KB gz at 400 kbit/s, plus
parse/execute under ×6 CPU, and nothing else. The practical conclusion survives
and is now correctly grounded: **painting something before the JS lands is the
lever**, and shrinking the 91 KB entry set is the only other thing FCP responds
to. Splitting the eager model layer is still worth doing for transfer and parse
on `/shop/*` — but it will **not** move first paint, and this document should
not be read as saying it will.

**The staleness, which matters more than the numbers.** The baseline was last
touched **2026-08-20** (`463f4b4a`). The service worker landed **2026-08-21**
(`f39dfe50`, PR #519). The baseline's own Method section says so without
knowing it: *"The build's `dist/` contains no `sw.js`, so the service-worker
registration in `showroom/index.html:59` 404s and no SW cache interferes with
runs."*

Two consequences:

1. **There is no repeat-visit number in this repo.** Not "unreported" —
   unmeasurable on the tree that was measured. The single most important
   performance question for a shop that opens the app every morning is
   unanswered. Given the worker's cache-first `/assets/` handler
   (`sw.js` fetch handler) a warm open should be dramatically faster, but that
   is a prediction, not a measurement.
2. **First visit now costs more than the baseline says.** Built on this tree,
   the install-time precache is **45 URLs / 1.91 MB raw / 522 KB gzipped**
   (measured; the seal script's own header still says "roughly 480 KB"). Most
   of that overlaps what the first route already downloaded, but on the chooser
   route — which the baseline measures at 261 KB — it does not. On a metered
   Myanmar connection the untracked delta is real.

Source has also grown **6.4%** since the baseline (`showroom/src`:
5,522,132 → 5,872,954 bytes; 678 → 690 files), so even the cold numbers are
drifting.

**Gate: engineering.** But the first step is re-measuring with the service
worker present and adding a warm-load row, not optimizing anything.

---

## 7. Offline — verified against live source, and the roadmap is stale

Built this tree and read the sealed worker. **The precache covers the till.**

`showroom/scripts/seal-offline-precache.mjs` derives the list from Vite's own
manifest: two roots (`index.html`, the `core-app` chunk) contribute their full
static graphs plus one level of dynamic imports, minus a named exclusion list.
Three checks make silent drift fatal — every `/assets/` URL in the built
document must be present; every precached URL must exist on disk; and the
script fails outright if `/assets/core-app-*.js` is missing.

Measured on `6647a2b2`: **35 asset URLs + 10 shell URLs = 45**, 1.91 MB raw,
522 KB gzipped. `core-app-BJ26dFGI.js` is in the list, as are
`ReceiptDialog`, `ShopToday`, `ShopInventoryFoundation`, `ShopServiceSchedule`,
`ShopMonthlyStatement`, `ChannelOrderIntake`, `PlantOrderFoundation`,
`commerce-model`, `shop-loyalty` and `shop-ledger-accounts`. `PaymentQr` is a
static import into `core-app` (`CoreApp.tsx:53`) and emits no separate chunk,
so the merchant QR display is precached too.

**Not precached** (`ONLINE_ONLY`): `SettingsPage`, `WorkspaceControlsPage`,
`ProductOnboardingPage`, `SignupPage`, `ManagedLoginPage`,
`ManagedAccountPage`, `ClientDataOnboarding`, and everything under
`src/products/` — so Website and Ecommerce. All still cache opportunistically
on first visit through the worker's `/assets/` handler.

That exclusion set is well-argued but it has **two Myanmar-specific edges**:

- **The merchant QR upload lives in `SettingsPage`**, which is excluded. The
  counter's own no-QR hint points at `/settings/#controls`
  (`PaymentQr.tsx:58`). An owner who first discovers she needs a QR while the
  internet is down cannot reach the page that fixes it on a fresh device.
- **The backup/storage wall lives in `WorkspaceControlsPage`**, also excluded.
  See §7.1.

Neither is fatal — both cache after one online visit — but both are exactly the
"the internet is down and I need this now" moment the offline claim is sold on.

### 7.1 The storage wall — rank 7

`local-workspace-backup.ts` added a real, well-reasoned capacity warning in
this window (`496c727e`). Its ceiling is 5 MB / 256 records
(`local-workspace-backup.ts:16-17`), and the module header records a measured
finding worth knowing: a Shop workspace at its own 2 MiB ceiling spends 50.3%
of the backup cap, and a shop also running Plant loses the ability to back up
at 1,183 Plant jobs — bisected to the byte.

The message she gets is (`local-workspace-backup.ts:152-161`):

> "This device cannot be backed up to a file. … Nothing has been lost and your
> records are still on this device, but there is no file that can put this
> device back the way it is now. Keep a readable copy of your sales with
> Download sales archive below, and do not reset this device until a backup
> succeeds."

That is the most consequential sentence in a device-local product, and for a
Burmese-first owner it is **unreadable**. Worse, it cannot be reached by the
existing mechanism: it is assembled by string concatenation from three
fragments plus interpolated numbers, so exact-match `bi()` has no key to match.
`localWorkspaceBackupHeadroomMessage` (`:416-432`) has the same shape, and
`WorkspaceControlsPage.tsx` has **119 visible strings, 19 attributes and zero
`bi()` calls**.

**Gate: both.** The sentence needs a native reviewer (founder-gated), and it
needs a mechanism that exact-match does not provide (engineering) — this is the
same third class `G1-STRING-MECHANISM-DECISION.md` §2.4 named for the
embedded-`<Link>` sentence, and R2 does not reach it either.

---

## 8. Document claims found stale — source wins, stated explicitly

Four. Finding them is a result, not an inconvenience.

**8.1 — `ERP-COMPETITIVE-ROADMAP.md` §2 item 1 and §6 G1 (lines ~67-78,
~570-600). STALE. Corrected here.**

The roadmap says the precache list "covers only `/` plus the assets named in
`index.html`, and `/shop/` and `/plant/` are served by a lazy chunk … that is
NOT in that list", and draws two consequences: a first-run offline visit to
`/shop/` cannot load the till, and "every release re-opens the hole."

**Both were true when written and both are now false.** PR #519
(`f39dfe50`, 2026-08-21) rewrote the seal to read Vite's manifest, and it fails
the build if the `core-app` chunk is absent. Measured on `6647a2b2`:
`/assets/core-app-BJ26dFGI.js` is precache entry 18 of 35. The
"every release re-opens the hole" claim is also closed —
`precacheAll()` runs on every install and re-fetches the full set, carrying
`/assets/` entries over from the retained predecessor cache where the hash is
unchanged, and `activate` retains this release plus the previous one.

The roadmap's *comparative* half stands unchanged: Odoo 19 and Square both ship
offline selling, so what remains ours is offline selling with no account and no
server.

**8.2 — `G1-STRING-MECHANISM-DECISION.md` §4.5, the numeral bullet. HALF
WRONG.** It states every counter number "comes from `formatMoney` or
`toLocaleString` and is Arabic". Bare `toLocaleString()` follows the device and
yields `mymr` digits on a Burmese-locale phone (§3, measured). The bullet's
conclusion — that a reviewer cannot sign off a count template without settling
the numeral question — survives and is strengthened.

**8.3 — `ANDROID-PERFORMANCE-BASELINE.md`. NOT WRONG, BUT PRE-SERVICE-WORKER.**
Every number in it was measured on a build with no `sw.js`, one day before the
worker landed. It contains no repeat-visit measurement and cannot, and its cold
numbers now sit against a source tree 6.4% larger (§6). The document is honest
about the missing worker in its own Method section; what is stale is any
reading of it as "the app's performance profile".

**8.4 — `CoreApp.tsx:1289`, a source comment.** Describes `item.nameMy` as
"the Burmese product name the owner typed in themselves." No path in this repo
writes it from any form; `commerce-workspace.ts:56-60` is the accurate account
(§2.5).

**And one doc that checked out clean, worth saying:**
`G1-STRING-MECHANISM-DECISION.md` §3.1a's enumeration — 7 live call sites, 5
distinct strings, 3 of them back office — reproduces exactly on `6647a2b2`
(§2.2). Its self-corrections held up.

---

## 9. What this audit did not establish

Stated so nobody reads a gap as a clearance:

- **Whether a mixed-language accessible name is usable.** No assistive
  technology exists in this sandbox. `G1-STRING-MECHANISM-DECISION.md` §3.1
  correctly marks this unverified, and it is *already live* on the five
  confirmed strings. TalkBack on a real Android phone is still the check.
- **Zawgyi.** No Zawgyi detection, conversion or font handling exists anywhere
  in `showroom/src` (grep is empty). Myanmar's Unicode migration is largely
  complete, so this is probably fine — but "probably" is the honest word, and a
  Zawgyi-only device would render every Burmese string in this app as
  mojibake, including the five already shipped.
- **Whether `BarcodeDetector` is actually present** on the low-end Android
  builds a Yangon till runs. The component degrades correctly if it is absent,
  so the failure is soft — but the camera-scan feature's real availability on
  target hardware is unmeasured.
- **Repeat-visit performance** (§6).
- **Any Burmese wording judgement.** Every draft in `i18n-actions.ts` carries
  its own reviewer question and this document does not answer one of them.
  Nothing here proposes a Burmese string.

---

## 10. If only three things happen

1. **Wire the 28 signed-off verbs, starting with the 7 real Shop control
   sites, and render `nameMy` on the monthly statement** (§2.4). Engineering
   only, no review, no decision, Burmese appears immediately. Days, not weeks.
2. **Settle the numeral question and the language-mode question together**
   (§3, §2.6). Both are founder decisions with a native input, both are
   upstream of confirming any of the 40 pending strings, and one of them
   (numerals) is currently producing two scripts on one sale.
3. **Reverse the Burmese-product-name policy, or decide deliberately not to**
   (§2.5). It is the highest-frequency Burmese on the till and it is blocked by
   a stated policy, not by missing code. Either answer is defensible; leaving
   it undecided is what costs adoption.

Everything else in §1 is real, and none of it is as load-bearing as these
three.
