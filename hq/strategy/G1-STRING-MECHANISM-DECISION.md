# G1 — string attributes and parameterised strings: mechanism decision

Status: **DECISION DOCUMENT, 2026-08-21. No product code in this PR.**
Owner lane: `ERP-COMPETITIVE-ROADMAP.md` §6.4 G1 (the single product
precondition on the distribution constraint §6.6 names).
Builds on: `DESIGN-PROGRAM.md` "EN/MY composed labels — mechanism decision"
(Option A/B/C, recommendation **B scoped by traffic**) and its batch-3 entry
(PR #536, the counter slice).

PR #536 wired the counter and then said, correctly, that roughly half a
cashier's words are still English and that the remainder needs *a mechanism
decision, not further review*. This is that decision. It covers the two
classes #536 named — string attributes and parameterised strings — and
nothing else.

**It does not re-open Option B.** §5 below states where it extends B, where it
leaves B alone, and the one place a reader might mistake it for Option A
returning. B's core property — *the reviewed unit is exactly what the operator
meets* — is preserved in both recommendations.

---

## 1. The short answer

| | Recommendation | Gated on? |
| --- | --- | --- |
| **String attributes** | **R1 — move the string out of the attribute and into a content slot; keep `bi()` unchanged.** No new function. `aria-labelledby` where visible text already exists, an `sr-only` node where it does not. | **Neither**, for all 10 `aria-label` sites. Ships ahead of sign-off exactly as #536 did. |
| **The 4 sites R1 cannot reach** (2 `placeholder`, 1 `alt`, 1 `title`) | **Defer. Build nothing.** | **Founder-gated**, and the question is stated verbatim in §3.6. Two of the four are not reachable on a touch till at all. |
| **Parameterised strings** | **R2 — a second table entry shape: a template pair whose Burmese half carries its own `{placeholder}` positions, substituted independently, behind the same confirmed-only gate.** | **Neither, to ship the mechanism.** Per-line content is native-speaker-gated as always. **One new founder question (numeral script, §4.5) blocks confirming the first count template** — but not shipping the mechanism. |

Both recommendations preserve the property that made #536 shippable: `bi()`
falls back to English for anything not `confirmed`, so wiring lands ahead of
review and sign-off stays a per-line status flip. That property weighed more
than anything else in choosing between the options below.

---

## 2. What was actually measured

Measured in source on this branch (`origin/main` @ `4a55916b`), not estimated.
The counter slice is what #536 defined it as: `ShopCounter` (CoreApp.tsx
1144–1305), `PaymentQrButton` (PaymentQr.tsx), `ReceiptDialog.tsx`,
`commerce-tabs.ts`, and the `BarcodeScanButton` call the counter makes.

### 2.1 String attributes — the true count is 14 sites, not "every aria-label"

Attribute census (`aria-label` / `placeholder` / `title` / `alt`):

| Component | Sites |
| --- | --- |
| `ShopCounter` | 11 |
| `PaymentQrButton` | 2 |
| `BarcodeScanButton` (one counter call, one `label` prop → `aria-label` ×2 + `title` ×1) | 1 |
| `ReceiptDialog` | **0** |
| **Counter slice total** | **14 sites / 13 distinct strings** |
| App-wide, for scale | 446 sites (356 static, 90 dynamic) across `showroom/src` |

**The counter slice is 3% of the app's attribute surface.** One of the 13
strings (`Current sale`) already has a table entry from #536, so the mechanism
has to reach **12 new strings**, not a class of unbounded size.

Two corrections to #536's own list, both in the direction of *less work*:

- **`Find or scan an item` is not an attribute.** It is
  `<span className="sr-only">` content (CoreApp.tsx:1261) — a ReactNode slot.
  `bi()` can enter it **today**, with no mechanism at all. It is also the
  existence proof for R1: the counter already labels a control from `sr-only`
  content.
- **`ReceiptDialog` contributes zero attribute sites.** It names its dialog
  with `aria-labelledby="receipt-dialog-title"`, pointing at visible text. That
  is R1's preferred shape, already shipped, already in the file #536 touched.

Three sites #536's list missed, in the direction of *more*: `Shop attention`
(the counter's summary nav), the `Guest` placeholder, and the two on the
payment-QR dialog.

### 2.2 The full site table

| # | Site | Attribute | Class | R1 shape |
| --- | --- | --- | --- | --- |
| 1 | `<section>` counter root, CoreApp:1256 | `aria-label="Sales counter"` | static landmark | `aria-labelledby` → `sr-only` node |
| 2 | summary `<nav>`, CoreApp:1260 | `aria-label="Shop attention"` | static landmark | `aria-labelledby` → `sr-only` node. **Pinned**, verify:4232 |
| 3 | search `<input>`, CoreApp:1261 | `placeholder="Search or scan SKU"` | static, **visible** | **residue** — no node exists. **Pinned**, verify:5818 |
| 4 | `BarcodeScanButton` call, CoreApp:1261 | `label` → `aria-label` ×2 | static control | `sr-only` node (prop shape change) |
| 5 | same | `label` → `title` | static, **visible on hover** | **residue** |
| 6 | product tile `<button>`, CoreApp:1266 | `aria-label={`Add ${item.name} to this sale`}` | **parameterised** control | content-derived name — see §3.4 |
| 7 | quantity badge `<span>`, CoreApp:1269 | `aria-label={`${quantity} in sale`}` | **parameterised**, **currently dead** — see §3.4 | delete or promote to content |
| 8 | cart backdrop `<button>`, CoreApp:1276 | `aria-label="Close current sale"` | static, empty control | `sr-only` node |
| 9 | `<aside>` current sale, CoreApp:1277 | `aria-label="Current sale"` | static landmark; **table entry exists** | `aria-labelledby` → the header's existing `bi('Current sale')` |
| 10 | cart close `<button>`, CoreApp:1278 | `aria-label="Close current sale"` | static, `×` glyph | `sr-only` node + `aria-hidden` on `×` |
| 11 | stepper `<button>`, CoreApp:1280 | `aria-label={`Remove one ${item.name}`}` | **parameterised** control | `sr-only` node + template (needs R2) |
| 12 | stepper `<button>`, CoreApp:1280 | `aria-label={`Add one ${item.name}`}` | **parameterised** control | `sr-only` node + template (needs R2) |
| 13 | customer `<input>`, CoreApp:1283 | `placeholder="Guest"` | static, **visible**, has a code twin | **residue** — see §3.6 |
| 14 | QR `<dialog>`, PaymentQr | `aria-label={`${method} payment QR`}` | parameterised on a **refused** brand token | `aria-labelledby` → the dialog's existing `bi('Scan to pay')` + `<h2>{method}</h2>` |
| 15 | QR `<img>`, PaymentQr | `alt={`${method} merchant payment QR`}` | parameterised | **residue** |

(15 rows, 14 sites: rows 4 and 5 are one `label` prop landing in two attribute
kinds, and that split is exactly why the `BarcodeScanButton` conversion is not
free.)

**10 `aria-label` sites → R1 reaches all of them.** **4 string-only residue
sites** (rows 3, 5, 13, 15) → §3.6.

### 2.3 Parameterised strings — 15 distinct, 16 sites

| Where | String |
| --- | --- |
| `ShopCounter` | `{pack} working sample`; `{firstWorkflow} {pack} sample items are loaded.`; `{n} open orders`; `{n} low stock`; `{n} in stock`; `{n} item` / `{n} items` (two sites: cart header + mobile cart bar); `{price} each`; `{customer} · {n} pts` |
| `PaymentQrButton` | `Show {method} QR · {amountDue}`; `No {method} QR saved on this device yet.` |
| `ReceiptDialog` | `Discount ({code})`; `Tax ({code})`; `Due {date}`; `Promised {date}`; `{date} · {channel}` |
| plus, as attributes | rows 6, 7, 11, 12, 14, 15 of §2.2 |

### 2.4 The third bullet of #536's list needs no mechanism at all

#536 grouped `optional`, the `Guest` placeholder, the empty-catalog sentence
and the counter footer instruction as one leftover. They are three different
problems:

- **`optional` (CoreApp:1283) and the footer instruction `Confirm to create the
  order. Finish payment and handoff in Orders.` (CoreApp:1300)** are ordinary
  static strings. Plain Option B table entries. **No mechanism, no decision — a
  batch-4 drafting pass.** So is `Existing Shop catalog data was preserved.`
  and the QR dialog's boundary paragraph.
- **The empty-catalog sentence** is not a string: `Your catalog is empty. <Link
  …>Add or import products</Link> before the first sale.` is a ReactNode with
  an anchor in the middle. Exact-match cannot take it as one key, and splitting
  it into three keys hands the reviewer three fragments whose Burmese word
  order they cannot control. **This is a third class, small (this is the only
  one on the counter), and R2 does not solve it.** Named here so it is not
  quietly folded into a batch that cannot carry it.
- **`Guest`** is the residue case in §3.6.

---

## 3. Problem 1 — string attributes

### 3.1 The constraint that decides it

`aria-label` is a flat DOMString. **There is nowhere inside it to mark a
language change.** `lang` is an element attribute: it applies to the element's
content *and* to the whole of its `aria-label`, so setting `lang="my"` on a
button whose label reads `English · Burmese` declares the English half Burmese
too. There is no attribute-level equivalent of the `<span lang="my">` that
`bi()` already emits.

That is not a preference. It is the shape of the platform, and it means any
string-returning mechanism ships an **unmarked mixed-language string** — one
accessible name, one declared language, two languages inside it.

A content-derived accessible name is the only form that *can* carry `lang`,
because the name is computed from a subtree and the subtree keeps its markup.
Whether a given screen reader then switches voice mid-name is
assistive-technology dependent and **was not tested here** — this sandbox has
no screen reader. What is certain is the asymmetry: the content form leaves the
information present for an AT that uses it; the string form destroys it before
the AT ever sees it.

### 3.2 Recommendation R1 — content-slot conversion, no new function

Move the string from the attribute into a node, and call the `bi()` that
already exists. Three shapes, in preference order:

1. **`aria-labelledby` pointing at text already on screen.** Zero new strings,
   zero new table entries. Rows 9 and 14 are pure instances: the `<aside>`'s
   own header already renders `bi('Current sale')`, and the QR dialog already
   renders `bi('Scan to pay')` beside `<h2>{method}</h2>`. `ReceiptDialog`
   shipped this shape already.
2. **An `sr-only` node inside the control**, with `aria-hidden="true"` on any
   decorative glyph. Rows 1, 2, 4, 8, 10. The counter already does this at
   CoreApp:1261, and `.sr-only` is one line of `core-app.css` (:116).
3. **Content-derived naming** — drop the attribute and let the control name
   itself from what it already shows. Row 6; see §3.4, where it also fixes a
   bug.

### 3.3 What R1 costs, stated so nobody discovers it mid-PR

- **`aria-hidden` is now load-bearing.** Today `aria-label="Close current sale"`
  overrides the `×` glyph. Remove it and the accessible name becomes
  `× Close current sale · <MY>` unless the `×` is hidden. The counter already
  hides `+` and `→` this way, so the pattern exists — but a missed
  `aria-hidden` is silent, invisible in review, and audible only to the one
  user who cannot see the screen. It needs a pin (§6).
- **`BarcodeScanButton` needs a prop split.** One `label: string` currently
  feeds `aria-label` twice and `title` once. Naming it from content means the
  aria half becomes a node and the `title` half stays a string — the prop
  cannot be one thing any more. This component has **five other call sites**
  (catalog SKU ×2, Plant job card, Plant material, counter), all outside the
  counter slice, so the change has to keep the string form working for them.
  This is the single most expensive site in the census; it may be worth its own
  PR, or worth deferring with the residue.
- **Row 7 (`{quantity} in sale`) should probably be deleted, not translated.**
  See §3.4.

### 3.4 A bug the census found, which R1 fixes as a side effect

`aria-labelledby` beats `aria-label`, and `aria-label` beats the element's
contents. The product tile is:

```
<button aria-label={`Add ${item.name} to this sale`} …>
  <ProductPhoto …/>
  <span className="shop-product-copy">
    <strong>{item.name}</strong>
    {item.nameMy ? <small lang="my">{item.nameMy}</small> : null}
    <b>{formatMoney(item.price)}</b>
    <small>{item.onHand ? `${item.onHand} in stock` : bi('Out of stock')}</small>
  </span>
  {quantity ? <span className="shop-product-quantity" aria-label={`${quantity} in sale`}>{quantity}</span> : …}
</button>
```

The button's own `aria-label` overrides that entire subtree. So a screen-reader
user at this counter hears **"Add Rice 5kg to this sale"** and hears **neither
the price, nor the stock level, nor the quantity already in the sale** — and
never `item.nameMy`, the Burmese product name the shop owner typed in
themselves, which is sitting right there in the markup. Row 7's
`{quantity} in sale` is on a `<span>` with no role *inside* that override; it
is not part of any accessible name and, as far as this census can determine, is
never announced at all.

This is a live accessibility defect independent of Burmese. It is also the
strongest single argument for R1: naming the tile from its contents fixes the
price, the stock line, the quantity badge **and** picks up `nameMy` for free,
which is more Burmese than any table entry could have bought at this site.
Whoever implements row 6 should treat it as a correctness fix that happens to
serve G1, and should verify the resulting name in a real AT rather than by
reading the code.

### 3.5 Rejected for problem 1

- **`biAttr(en): string` returning `"English · Burmese"`.** The obvious option,
  and the cheap one — it would be ~6 lines, reuse the same gate, and keep the
  English fallback, so it *is* shippable ahead of sign-off. Rejected as the
  **default** because of §3.1: it produces an unmarked mixed-language
  accessible name, permanently. A node can be filtered later (render one half,
  both halves, or a per-viewer choice) because the halves stay separable in the
  tree; **a joined string cannot be un-joined.** Choosing the string form now
  forecloses a decision that has not been taken yet — including the language
  setting #536 deliberately did not add. It is not rejected on merit for the
  residue in §3.6, where no node exists; it is rejected as the mechanism for
  the 10 sites where a node does.
- **`aria-label` plus `lang="my"` on the element.** Declares the English half
  Burmese and the visible English text Burmese along with it. Strictly worse
  than doing nothing.
- **Per-language attribute maps behind a language setting** (`aria-label={t(k)}`
  with one language selected). This is what a conventional i18n stack does, and
  it is the only shape that gives a screen reader one clean language. It
  requires the language setting #536 declined to add, whose reasoning
  (DESIGN-PROGRAM batch 3: what a Burmese-only till costs when ~70% of the app
  has no Burmese; whether owner and cashier want different answers on one
  device) is a founder/native question and its own planning pass. **Not
  rejected on merit — rejected as out of sequence.** If that pass ever runs and
  says "yes, a setting", R1's content nodes convert to it more cheaply than
  joined strings would.
- **Sweeping all 446 app-wide sites.** Rejected: G1's whole sequencing argument
  is the counter slice first. 432 of those 446 are back office, Plant, Website
  and Ecommerce, which §6.4 G1 puts in the L scope, not the M.

### 3.6 The residue — 4 sites, and the founder question, stated straight

R1 cannot reach `placeholder="Search or scan SKU"`, `placeholder="Guest"`,
`title` on the scan button, or `alt` on the QR image. These are strings by
construction — a placeholder has no content slot, and neither does `alt`.

Recommendation: **defer all four. Build nothing for them now.** Reasons:

- **`title`** renders as a hover tooltip. The counter runs on a phone. It is
  not reachable on the device that matters, and the same string already reaches
  a screen reader through `aria-label`.
- **`alt` on the QR image** is parameterised on `{method}`, which batch 3
  explicitly **refused** to translate (Cash / KBZPay / WavePay are brand names
  shown in Latin in this app's own Burmese ledger strings). The dialog around
  the image is labelled and already renders `bi('Scan to pay')` and
  `bi('Amount due')`; the image itself is a QR code, which no AT can convey
  usefully in any language.
- **`placeholder="Guest"`** has a code twin: `customer.trim() !== 'Guest'`
  gates the loyalty chip (CoreApp:1285). Translating the displayed hint
  decouples it from the sentinel the code compares against. Not unfixable, but
  it means this site is a *behaviour* change wearing a translation's clothes,
  and it should not ride along in a copy batch.
- **`placeholder="Search or scan SKU"`** is the only one with a real cost to a
  Burmese-first cashier — it is the visible hint on the counter's search field.
  A joined bilingual placeholder roughly doubles its length inside an input on
  a 375px bar; the honest fix is probably to make the field's `sr-only` label
  visible and bilingual (R1 already reaches that node) rather than to double
  the placeholder. **That is a design pass, not a mechanism.**

**The founder question these four actually raise, asked plainly:** *should a
screen reader ever read a SuperMega control's name in two languages?* R1 makes
that answerable later, because it keeps the halves separable. `biAttr()` makes
it answered now, silently, and permanently. Nobody has asked a Myanmar shop
owner or a Myanmar AT user this, and this document is not the place to guess
the answer. Until it is asked, the four residue sites stay English and the
count stays at four — which is a smaller number than "every aria-label and
placeholder" implied, and small enough to leave open.

### 3.7 Gating answer for problem 1

- **The 10 `aria-label` sites: neither founder-gated nor native-speaker-gated.**
  They call the same `bi()` under the same confirmed-only gate. English renders
  until a native speaker signs each line off; the wiring lands first, exactly
  as #536's did. Row 9 and row 14 need **no new table entries at all**.
- **The 4 residue sites: founder-gated**, on the question in §3.6, and
  recommended deferred rather than decided.

---

## 4. Problem 2 — parameterised strings

### 4.1 Recommendation R2 — template-pair entries, substituted independently

A second entry shape in `ACTION_TRANSLATIONS`, and one composer beside `bi()`:

- The key is the **English template**, placeholders included: `'{n} in stock'`.
- The value carries a **Burmese template** with its own `{n}` positions, plus
  the same `status` field: `{ my: '<Burmese, pending>', status:
  'pending_native_review' }`.
- The composer substitutes each half **independently**, then renders the same
  `bi-label` wrapper `bi()` already emits, with `lang="my"` on the Burmese
  half only.
- Not `confirmed` → the English template alone, filled. Byte-identical to
  today's output.

What that buys, in the terms the Option B analysis already used:

- **The reviewed unit is still the whole phrase.** B's defining property. The
  reviewer sees `{n} in stock` and writes the whole Burmese phrase with the
  hole in it — they are not asked to bless a fragment.
- **Word order is the reviewer's, not English's.** They place `{n}` wherever
  Burmese wants it, including after the noun, and can write a classifier into
  the template because the template names its own noun.
- **Plural is not forced onto Burmese.** English needs two keys (`{n} item`,
  `{n} items`); the Burmese halves may be identical, and the reviewer decides
  that rather than a plural-category model deciding it for them.
- **The gate is unchanged**, so this ships ahead of sign-off. That is the
  property that made #536 cheap, and R2 keeps it.

### 4.2 Rejected — split at the placeholder

`{n}` rendered outside, `bi('in stock')` inside: the number keeps English
position and the Burmese half is a numberless tail sitting after it. It is
Option A's failure in a new place — the Burmese reads as a fragment whose
referent is a number it is not attached to — and unlike Option A it does not
even save review effort. Rejected.

### 4.3 Rejected — an i18n library (ICU MessageFormat, i18next, FormatJS)

The conventional answer, and it is **currently unshippable**, on two counts:

1. It is a runtime dependency. `showroom/package.json` is **digest-bound**
   (CLAUDE.md, gate section): adding a dependency requires the rehearsal
   cascade, which is blocked on a Windows-toolchain gap
   (`tools/run_postgres17_rehearsal.mjs` demands a local loopback PG17 from the
   EDB Windows x86-64 binaries and hardcodes `externallyHosted: false`). No
   amount of Supabase work substitutes. A Linux agent sandbox cannot complete
   it.
2. On merit it would be wrong here anyway. ICU plural categories buy nothing
   for Burmese (one category), and adopting a library means replacing the
   confirmed/pending status gate — the thing that lets an unreviewed draft sit
   in the repo without reaching a till — with a catalogue format that has no
   concept of "drafted but not signed off". That gate is this table's entire
   safety story and #536 pinned it for exactly that reason.

Worth stating for the record: if the digest blocker ever lifts, this is still
the wrong trade until the review gate has an equivalent in whatever replaces it.

### 4.4 Rejected — reviving Option A for parameterised strings

Verb-only gloss (`Add {name} to this sale` → `… · <Add verb>`) would cover
every parameterised site for free, with no new review. It is rejected for the
same reason DESIGN-PROGRAM rejected it as the default: the Burmese half names
the action and not the target, and the counter is precisely where two
adjacent controls share a verb — rows 11 and 12 of §2.2 are an `Add one` and a
`Remove one` **on the same stepper, side by side**. Under Option A one of them
glosses to the confirmed `Add` → `ထည့်မည်` and the other to the confirmed
`Remove` → `ဖယ်ရှားမည်`, which is fine; but the tile above them also glosses to
`ထည့်မည်`, so "add one more of this line" and "add this product to the sale"
become the same Burmese on one screen. That is the ambiguity failure the
design note already ruled on, landing on the highest-traffic surface in the
app. Nothing here changes that ruling.

### 4.5 What R2 does NOT close

- **Numeral script — and this one blocks sign-off, not shipping.** The table's
  own header states the app's convention is "Burmese numerals over Arabic
  digits", and the data layer honours it: `shop-service-scheduling.ts` ships
  `'အရောင်းဝန်ထမ်း ၁'`. But every number the counter interpolates comes from
  `formatMoney` or `toLocaleString` and is Arabic. So a `{n}` template drops an
  Arabic numeral into a Burmese phrase whose sibling strings in this same app
  use Burmese digits. **A reviewer cannot sign off `{n} in stock` without
  knowing which numeral arrives.** Answering it reaches money formatting, the
  receipt, and the printed acknowledgement, so it is a founder decision with a
  native input, not a translation line. **It does not block building R2** — it
  blocks confirming the first count template. New question 4 in §7.
- **Classifiers.** Burmese counts with numeral classifiers, and which one is
  correct depends on the noun being counted. A per-template entry can carry one
  classifier because each template names its own noun — that is a point in
  R2's favour over any generic pluralisation scheme. But `{n} items` at the
  counter counts *whatever the shop sells*, which may not take one classifier
  across a catalogue. This document does not know which classifier any of these
  strings wants and deliberately does not guess; it is a reviewer question, and
  `{n} items` may be the one string the reviewer answers with "rephrase it".
- **Item-name parameters — better than expected, but not solved.** Rows 6, 11
  and 12 interpolate `item.name`, the owner's own catalogue text, which under
  Option A's logic is code-mixing. Verified in source: `CommerceItem` already
  carries an optional **`nameMy`** (`commerce-workspace.ts:61`), validated
  (`:2534`, `:6433`), and the counter already renders it in both the tile and
  the cart line. So the composer can interpolate `item.nameMy ?? item.name` and
  these sites get a genuinely Burmese noun in a Burmese frame **whenever the
  owner filled the field in**. It is optional, most catalogues will not have
  it, and the fallback is still code-mixed — but the data source exists and
  should be used rather than worked around.
- **Brand-name parameters.** Row 14 interpolates `{method}`, which batch 3
  refused to translate on purpose. The frame can be Burmese; whether a Latin
  brand token inside a Burmese frame reads correctly is a reviewer question,
  and it is the same question the existing ledger string `KBZPay ပိုက်ဆံအိတ်`
  already answers in the affirmative for a different frame.
- **Money and date formatting.** `formatMoney`, `formatReceiptDate` and
  `toLocaleString` are untouched. `Due {date}` and `Promised {date}` on the
  receipt get a Burmese frame around an English-formatted date. Out of scope
  here; flagged so it is not mistaken for closed.
- **The embedded-`<Link>` sentence** (§2.4). R2 does not reach it.

### 4.6 Gating answer for problem 2

- **The mechanism: neither-gated.** It ships behind the existing gate with an
  English-only fallback, and every template can sit in the repo as
  `pending_native_review` without reaching a till — the same reason #536
  shipped.
- **The content: native-speaker-gated per line**, unchanged.
- **The first *confirmation* of any count template: founder-gated**, on the
  numeral question (§4.5). Shipping is not.

---

## 5. Is this re-litigating Option B? No — here is exactly where it stands

DESIGN-PROGRAM recommends **B, scoped by traffic**, and is BLOCKED on two
native-speaker questions. That recommendation stands, and this document was
written to extend it rather than replace it:

- **R1 changes no translation policy at all.** It is a *rendering-site* change:
  it moves strings from attributes into nodes so the existing `bi()` — the
  Option B renderer — can reach them. Every string it reaches becomes an
  ordinary Option B exact-match entry. Two of the ten sites need no entry at
  all.
- **R2 extends B's entry shape from a literal to a template.** It keeps B's
  defining property (the reviewed unit is what the operator meets) and drops
  B's stated limitation ("cannot cover parameterized labels at all") without
  touching the confirmed/pending gate or the exact-match lookup. The design
  note listed that limitation as a minus of B, not as a decision to leave
  parameterised strings alone forever; this is the answer to it.
- **Option A is re-rejected, not revived** (§4.4), on the design note's own
  reasoning, with one new piece of evidence: the counter's stepper puts an
  `Add one`/`Add to sale` collision on a single screen.
- **Option C is untouched.** Nothing here proposes typography.

The one thing a reader might mistake for A returning is R2's independent
substitution — because the composer *does* assemble a Burmese string from
parts. The difference is who wrote the parts: under A, code composes a verb
gloss the reviewer never saw in position; under R2, the reviewer writes the
entire Burmese template, hole included, and code only fills the hole they
placed.

---

## 6. Verifier pin implications

#536 added 28 pins, including the load-bearing one: `bi()`'s confirmed-only
gate, pinned byte-exact at `verify_app_build.mjs:5865` as
`"if (!entry || entry.status !== 'confirmed') return en"`.

**Do not refactor that gate into a shared helper for R2's composer.** It is
tempting and it is wrong twice: it breaks a byte-exact pin for no product
value, and it replaces two independently pinned guards with one point of
failure. **The composer should repeat the same guard verbatim and get its own
pin.** Duplication is correct here because the pin *is* the safety mechanism —
the same reasoning the belt already applies to this table.

Pins each recommendation touches:

| Pin | Where | Effect |
| --- | --- | --- |
| `bi()` confirmed gate | verify:5865 | Untouched by R1 and R2. Must stay. |
| `bi-label` / CSS lockstep pair | verify:5869-5871 | Untouched. R2's composer should emit the same wrapper and be pinned to it. |
| `aria-label="Shop attention"` | verify:4232, fail `task_first_core_ui_contract_changed` | **R1 row 2 breaks this.** Lockstep pin edit in the same commit — the pin should become the `aria-labelledby` + `sr-only` pair, not just move. |
| `placeholder="Search or scan SKU"` | verify:5818, fail `shop_counter_direct_demo_missing` | **Untouched if the residue is deferred**, which is another reason to defer it. |
| `{unitCount ? <button aria-controls="shop-current-sale"` | verify:5823 | R2 touches the *contents* of that button (`{n} items`), not the opening tag. Prefix pin survives. Confirm before editing. |

New pins these mechanisms warrant, each negative-tested by mutating the source
and confirming the belt goes red, in the house style:

1. **The composer's own confirmed-only guard**, byte-exact, with the same
   in-file comment #536 wrote explaining why losing it is silent.
2. **`aria-hidden` lockstep on every converted icon button** (§3.3). Dropping
   it silently prepends `×` or `−` to an accessible name. Nothing else in the
   belt would notice.
3. **`.sr-only` still exists in `core-app.css`** — the same lockstep shape as
   the `.bi-label` pin, because R1 makes a stylesheet rule load-bearing for
   *layout* (an unstyled `sr-only` span becomes visible text on the counter).
4. **The dead `aria-label` on the quantity badge does not come back** (§3.4), a
   negative pin, so the override bug cannot be re-introduced by someone
   "restoring" a label.

And one standing rule worth adopting now, because it is what made row 2
expensive: **on the counter, pin the `bi()` call, not the English literal.** A
pin on `aria-label="Shop attention"` costs a lockstep edit the moment that site
is translated; a pin on the call site and its table key survives it. #536
already does this for the strings it wired — the rule is to apply it to the
sites it did not.

---

## 7. Questions for the native-reviewer / founder packet

DESIGN-PROGRAM records questions 1 and 2 (the 14 batch-2 phrases; the
Option-A gloss question) and #536 added a third (the batch-3 per-entry calls,
of which `Create order`, `Stock` and `Print receipt` are the risky ones). This
document adds two, both new, neither answerable by an engineer:

4. **Numeral script (founder, with native input; blocks confirming any count
   template).** When a Burmese phrase carries a number the app computed — a
   stock count, a price, a points balance — does the number render in Burmese
   numerals or Arabic? The data layer already uses Burmese numerals
   (`shop-service-scheduling.ts`); the counter's own numbers are Arabic. The
   answer reaches money formatting, the receipt and the printed
   acknowledgement, so it is not a per-string call. §4.5.
5. **Two languages in an accessible name (founder).** Should a screen reader
   ever read a control's name in two languages? R1 keeps this answerable later
   by keeping the halves separable in the DOM; the four residue sites in §3.6
   stay English until it is answered. §3.6.

---

## 8. Sizing, and what this does not close

**Sizing** (build effort only; review is separate and is the expensive half):

| Piece | Size | Ships before sign-off? |
| --- | --- | --- |
| R1, rows 1/2/8/9/10/14 (landmarks + icon buttons + the two zero-entry `aria-labelledby` conversions) | **S** — one PR, ~6 sites, 4 new table entries, 4 new pins | **Yes** |
| R1, row 6 + row 7 (product tile content-naming, which is also the §3.4 bug fix) | **S–M** — own PR; needs AT verification, not code reading | **Yes** |
| R1, rows 4/5 (`BarcodeScanButton` prop split, 5 out-of-slice call sites) | **M** — own PR, or defer with the residue | **Yes** |
| R2 mechanism + 2–3 pilot templates | **S–M** — one PR: composer, entry shape, pins, pilot sites | **Yes** |
| R2 content batches (the remaining ~13 templates) | **S** each | **Yes** |
| The 4 residue sites | **not sized — deferred, founder-gated** | n/a |

**What this does not close, plainly:**

- **G1.** Nothing here translates a word. After R1 and R2 both ship *and* every
  drafted line is signed off, the counter is bilingual; the back office,
  Settings, onboarding, Plant, Website and Ecommerce — 432 of the 446 app-wide
  attribute sites and the great majority of its sentences — are still English.
  That is the L scope §6.4 G1 always described, and this document does not
  shorten it.
- **The review backlog.** The table is 92 entries, 33 confirmed, 59 pending.
  R2 adds ~15 more pending templates. **The mechanism decision makes the
  backlog bigger, not smaller** — its value is that the backlog is now the
  *only* thing between the counter and a Burmese-first cashier, instead of
  being blocked behind an undecided mechanism.
- **The printed receipt**, still English, still deliberately (`ReceiptDialog`
  scope note; the printed artifact is evidence, not a customer slip).
- **The language setting**, still not added, still its own planning pass
  (§3.5).
- **The empty-catalog sentence class** (§2.4) — one site today, no mechanism
  proposed.
- **Anything about how this sounds in a real screen reader.** Not tested. No AT
  in this sandbox. §3.4's conversion in particular should be verified on a real
  device before it is called done.

**No Burmese was invented in this document.** Every Burmese string quoted above
is cited from source: `ပိတ်မည်` / `ရှင်းလင်းမည်` / `ထည့်မည်` / `ဖယ်ရှားမည်` are
confirmed entries in `i18n-actions.ts`; `အရောင်းဝန်ထမ်း ၁` is
`shop-service-scheduling.ts:129`; `KBZPay ပိုက်ဆံအိတ်` is the ledger string the
table's refusal note cites. Everything a reviewer has yet to write is
`<Burmese, pending>`.
