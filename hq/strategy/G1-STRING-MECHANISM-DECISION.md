# G1 — string attributes and parameterised strings: mechanism decision

Status: **DECISION DOCUMENT, 2026-08-21. No product code in this PR.**
Owner lane: `ERP-COMPETITIVE-ROADMAP.md` §6.4 G1 (the single product
precondition on the distribution constraint §6.6 names).
Builds on: `DESIGN-PROGRAM.md` "EN/MY composed labels — mechanism decision"
(Option A/B/C, recommendation **B scoped by traffic**) and its batch-3 entry
(PR #536, the counter slice).

**REVISED 2026-08-21** after Codex review of PR #541. Three findings, all
verified, all applied: the accessible name is a **flat string**, which
retracts R1's original justification and makes R1 *recommended pending AT
verification* rather than decided (§3.1, §3.2, §3.5); naming the product tile
from its contents loses the action verb, so the fix changed shape (§3.4); and
the `Guest` deferral rested on a **false dependency**, now withdrawn in full
(§3.6). The site census, R2, the ICU rejection and the subtree-override finding
are unchanged.

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
| **String attributes** | **R1 — move the string out of the attribute and into a content slot; keep `bi()` unchanged.** No new function. `aria-labelledby` where visible text already exists, an `sr-only` node where it does not, `aria-labelledby` + `aria-describedby` where the control has data as well as an action. **Recommended pending AT verification (§3.1)** — not decided. | **Wiring: neither.** Ships ahead of sign-off exactly as #536 did. **Further `confirmed` flips of name-bearing strings: founder-gated** on question 5 — *not* the "first" one, since §3.1a finds 7 such sites already live on merged `main`, which makes the AT check validation of shipped behaviour with a defined remediation path. |
| **The 3 sites R1 cannot reach** (2 `placeholder`, 1 `alt`; the `title` duplicates a converted `aria-label`) | **Two placeholders are ordinary table entries — they are visual-only and are not accessible names. The `alt` is the one genuine AT-facing residue.** | Placeholders: **neither**. `alt`: **founder-gated** on the same question 5 as every other name. `Guest` was previously deferred here **on a false dependency, withdrawn in §3.6**. |
| **Parameterised strings** | **R2 — a second table entry shape: a template pair whose Burmese half carries its own `{placeholder}` positions, substituted independently, behind the same confirmed-only gate.** | **Neither, to ship the mechanism.** Per-line content is native-speaker-gated as always. **One new founder question (numeral script, §4.5) blocks confirming the first count template** — but not shipping the mechanism. |

Both recommendations preserve the property that made #536 shippable: `bi()`
falls back to English for anything not `confirmed`, so wiring lands ahead of
review and sign-off stays a per-line status flip. That property weighed more
than anything else in choosing between the options below — and after the §3.1
correction it is the *only* argument that separates R1 from the alternative it
was originally chosen over, so it is doing more work here than it looks.

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
| 6 | product tile `<button>`, CoreApp:1266 | `aria-label={`Add ${item.name} to this sale`}` | parameterised today, **becomes STATIC** under §3.4 | `aria-labelledby` (verb + name) + `aria-describedby` (data) |
| 7 | quantity badge `<span>`, CoreApp:1269 | `aria-label={`${quantity} in sale`}` | **currently dead** — see §3.4 | delete the attribute; the node becomes part of the description |
| 8 | cart backdrop `<button>`, CoreApp:1276 | `aria-label="Close current sale"` | static, empty control | `sr-only` node |
| 9 | `<aside>` current sale, CoreApp:1277 | `aria-label="Current sale"` | static landmark; **table entry exists** | `aria-labelledby` → the header's existing `bi('Current sale')` |
| 10 | cart close `<button>`, CoreApp:1278 | `aria-label="Close current sale"` | static, `×` glyph | `sr-only` node + `aria-hidden` on `×` |
| 11 | stepper `<button>`, CoreApp:1280 | `aria-label={`Remove one ${item.name}`}` | parameterised today, **becomes STATIC** under §3.4 | `aria-labelledby` (verb + line name) |
| 12 | stepper `<button>`, CoreApp:1280 | `aria-label={`Add one ${item.name}`}` | parameterised today, **becomes STATIC** under §3.4 | `aria-labelledby` (verb + line name) |
| 13 | customer `<input>`, CoreApp:1283 | `placeholder="Guest"` | static, **visible**, **not** an accessible name | **residue, but an ordinary table entry** — the "code twin" objection is withdrawn, §3.6 |
| 14 | QR `<dialog>`, PaymentQr | `aria-label={`${method} payment QR`}` | parameterised on a **refused** brand token | `aria-labelledby` → the dialog's existing `bi('Scan to pay')` + `<h2>{method}</h2>` |
| 15 | QR `<img>`, PaymentQr | `alt={`${method} merchant payment QR`}` | parameterised | **residue** |

(15 rows, 14 sites: rows 4 and 5 are one `label` prop landing in two attribute
kinds, and that split is exactly why the `BarcodeScanButton` conversion is not
free.)

**10 `aria-label` sites → R1 reaches all of them.** **4 string-only sites**
(rows 3, 5, 13, 15), of which §3.6 finds only **one** (row 15, the `alt`) is
actually an accessible name; the two placeholders are visual-only and the
`title` duplicates a converted `aria-label`.

### 2.3 Parameterised strings — 15 distinct, 16 sites

| Where | String |
| --- | --- |
| `ShopCounter` | `{pack} working sample`; `{firstWorkflow} {pack} sample items are loaded.`; `{n} open orders`; `{n} low stock`; `{n} in stock`; `{n} item` / `{n} items` (two sites: cart header + mobile cart bar); `{price} each`; `{customer} · {n} pts` |
| `PaymentQrButton` | `Show {method} QR · {amountDue}`; `No {method} QR saved on this device yet.` |
| `ReceiptDialog` | `Discount ({code})`; `Tax ({code})`; `Due {date}`; `Promised {date}`; `{date} · {channel}` |
| plus, as attributes | rows 6, 7, 11, 12, 14, 15 of §2.2 — **reduced to rows 14 and 15 by §3.4**, which turns the three tile/stepper verbs into static keys and deletes row 7 |

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

### 3.1 What the accessible name actually is — CORRECTED 2026-08-21

**An earlier revision of this document rested R1 on the claim that "a node keeps
the halves separable; a joined string cannot be un-joined." That claim is
withdrawn.** It is true of the DOM and false of what reaches an assistive
technology. Codex raised it in review of PR #541; it was checked and it holds.

The accessible name computation produces a **flat string**. It does not carry
descendant `lang` ranges into the exposed name. So a control converted by R1
exposes exactly the same unmarked mixed-language name that `biAttr()` would
have produced — which was the sole ground on which §3.5 rejected `biAttr()`.

**Measured, not asserted.** Chrome 152 headless over the DevTools Protocol
(`Accessibility.getPartialAXTree`), four markup shapes, one string, Burmese
taken from the CONFIRMED `Close` entry (`i18n-actions.ts:40`):

| Shape | Computed name |
| --- | --- |
| `aria-label="Close · ပိတ်မည်"` (the `biAttr()` shape) | `"Close · ပိတ်မည်"` |
| `sr-only` child containing `<span lang="my">` (R1 shape 2) | `"Close · ပိတ်မည်"` |
| `aria-labelledby` → node containing `<span lang="my">` (R1 shape 1) | `"Close · ပိတ်မည်"` |
| `aria-label` + `lang="my"` on the button | `"Close · ပိတ်မည်"` |

**Byte-identical in all four.** The protocol types the result
`"type": "computedString"` and exposes no language field on the name or on any
of its sources; a full-AX-tree dump for the page contains no `language`
property at all. Reproduce with
`scratchpad/axprobe.mjs` / `axprobe2.mjs` from the PR branch discussion, or
re-derive in three minutes against any Chrome build.

**Which part of this is spec and which is implementation:**

- **Spec.** The accessible name computation is defined to return a flat string;
  platform accessibility APIs expose a control's name as a plain string
  property with no per-range language. This is the shape of the platform, not a
  Chrome choice, and no browser can preserve the ranges while conforming.
- **Implementation, measured here.** Chrome 152 confirms the flat-string
  result above.
  > **WITHDRAWN 2026-08-21 (third correction):** an earlier revision added
  > "and further shows that `aria-label` *prunes the accessibility subtree*
  > (the button exposed 0 AX children) while content-derived naming *preserves
  > it* (2 AX children) — a real asymmetry." **That was a measurement artifact
  > of my own test markup, not a property of `aria-label`, and it is false.**
  > The `aria-label` case in that probe had exactly one child and it was
  > `aria-hidden="true"`; the zero was `aria-hidden` doing its job, not
  > `aria-label` pruning anything. Re-measured with the confound removed: a
  > button carrying **the same `aria-label`** and a non-hidden text child keeps
  > 2 AX children and both `StaticText` nodes, Burmese included. On the real
  > product-tile shape (img + nested spans) under `aria-label`, all seven
  > `StaticText` descendants survive un-ignored, `item.nameMy` among them.
  > **`aria-label` does not prune the accessibility subtree.**

  So there is **no** AX-subtree asymmetry between the mechanisms. No conclusion
  moves: the claim lived only in this bullet, was flagged non-load-bearing when
  it was made, and never entered §3.2's grounds for R1 or §3.5's rejection of
  `biAttr()` — both of which stand unchanged. What it does cost is a caveat
  this document had leaned on rhetorically in the PR discussion, so it is
  withdrawn here in full rather than softened.
- **Not established, and not establishable here.** What a screen reader
  *does* with a mixed-language flat name — one voice for the whole string, a
  fallback, silence on the half it cannot pronounce — is AT- and
  platform-specific. **There is no assistive technology in this sandbox**, and
  W3C and MDN are both blocked by this environment's egress proxy, so the
  primary spec text could not be quoted first-hand either. Both limits are
  recorded rather than papered over.

**Consequence for this document: R1 is RECOMMENDED, PENDING AT VERIFICATION —
not decided.** And note what that verification is *not*: §3.1a below establishes
that bilingual accessible names are **already live on merged `main`**, so this
check validates shipped behaviour rather than gating future work. What would
settle it:

1. TalkBack + Chrome on an Android phone of the class a Yangon till actually
   runs on: is a Burmese TTS voice even installed by default, and how is
   `"Total · <MY>"` announced on focus?
2. NVDA + Chrome on Windows as a second data point, with automatic language
   switching both on and off.
3. Both against a control converted by R1 and one using a joined `aria-label`,
   to confirm empirically that they are indistinguishable — the measurement
   above says they must be, but it measures the browser, not the AT.

### 3.1a Bilingual accessible names are ALREADY SHIPPED — CORRECTED 2026-08-21

A second correction, in the same shape as the first, and it changes what the
verification in §3.1 *is*.

> **WITHDRAWN:** "the founder question gates the first `confirmed` flip of any
> string that becomes an accessible name" — and, in the revision before it,
> "R1 keeps this answerable later."

**There is no first flip. It already happened, on merged `main`, and #536 is
what shipped it.** `bi()` renders its bilingual span *inside* controls, and a
control with no `aria-label` takes its accessible name from its contents — so
every already-`confirmed` entry reached from a control is, today, producing
exactly the mixed-language flat string whose AT behaviour §3.1 correctly marks
**not established**.

Enumerated against `origin/main`, cross-referencing every `bi()` call in the
app — **53 occurrences on 41 source lines, 45 distinct keys** — against the 33
`confirmed` keys. **7 call sites, 5 distinct strings, all inside
a `<button>` or `<Link>`** — i.e. all of them accessible names, none merely
visible text:

| Site | String | Path |
| --- | --- | --- |
| `CoreApp.tsx:1022` | `Cancel` | Cashier — the accountable-action gate the counter's *Review order* opens |
| `CoreApp.tsx:1280` | `Clear` | Cashier — cart header |
| `PaymentQr.tsx:72` | `Close` | Cashier — merchant QR dialog |
| `ReceiptDialog.tsx:234` | `Close` | Cashier — receipt dialog |
| `SettingsPage.tsx:2084` | `Open` | Back office |
| `SettingsPage.tsx:2105` | `Back` | Back office |
| `SettingsPage.tsx:2233` | `Cancel` | Back office |

Measured on the **exact shipped markup** — `bi()`'s real output shape from
`i18n-actions.ts:198`, `<span class="bi-label">Clear · <span
lang="my">ရှင်းလင်းမည်</span></span>` inside a `<button>` — Chrome 152 computes
the name `"Clear · ရှင်းလင်းမည်"`, `type: computedString`, no language field.
(`ရှင်းလင်းမည်` is the CONFIRMED `Clear`, `i18n-actions.ts:67`.)

**Three consequences, and they are what this correction is for:**

1. **The AT check is validation of shipped behaviour, not a gate on future
   work.** §3.1 framed it as a prerequisite. It is not — the exposure exists
   now. Reframed accordingly wherever it appears.
2. **Its priority rises.** It was scheduled as "before the first confirmation";
   it should now be done because something is already live, and it is the
   cheapest way to find out whether #536's two visible wins carry a hidden
   cost.
3. **It needs a remediation path, defined below**, because "the check comes
   back negative" now means "something live needs changing", not "do not start".

**Remediation if the check is negative.** The honest answer is cheap, and it is
cheap *because of how the table was built*:

- **Primary: flip the affected entries back to `pending_native_review`.** One
  line each in `ACTION_TRANSLATIONS`, no call site moves, and `bi()` returns
  plain English immediately for every site at once. This is the same one-line
  status edit that sign-off uses, run backwards. It is genuinely available and
  it is what the confirmed/pending gate is *for* — the gate was built so an
  unreviewed string never reaches an operator, and it works identically for a
  string that turns out to be unreadable rather than unreviewed.
- **The catch, stated so nobody treats the revert as free:** it is technically
  trivial and *visible to users*. Flipping `Close` back removes the only
  Burmese on a non-cash sale (the QR dialog and the receipt), which is exactly
  the thing #536 pulled the QR dialog into the slice to make consistent. So the
  revert is a **founder decision on a marginal result**, not an automatic
  rollback — and on a clearly negative result it is simply the right call.
- **If the result is "names are wrong but visible text is fine"**, the shape
  that survives is a single-language accessible name beside bilingual visible
  text — which means choosing *which* language, which is the language-setting
  pass §3.5 defers. That is the expensive branch, and it is the one worth
  knowing about early rather than late.

**And stated accurately in the other direction, because overstating this would
be its own error.** The live surface is **5 distinct strings, 7 sites, 3 of
them back office**; on the cashier path it is `Cancel`, `Clear` and `Close` —
three short, high-frequency, `Close`/`Cancel`-class controls whose meaning a
cashier also gets from position, icon and context. A mixed flat name may well
be perfectly usable, or mildly verbose, or genuinely bad; **that is precisely
what is unverified.** This is a check to run, not an incident. Nothing here
says the surface is broken — only that we do not know, and that we are already
shipping the thing we do not know about.

Neither #536 nor the first two revisions of this document noticed this, for a
reason worth recording: #536's own PR body *did* say "two strings DO change:
`Clear` and `Close`", and measured them visually at two viewports in both
themes. What nobody asked was what those two strings do to an **accessible
name** — a surface with no visual regression to catch it.

### 3.2 Recommendation R1 — content-slot conversion, re-derived on what survives

Still R1, on different and narrower grounds. Move the string out of the
attribute into a content slot and call today's `bi()`:

1. **`aria-labelledby` pointing at text already on screen.** Rows 9 and 14.
   Zero new strings, zero new table entries.
2. **An `sr-only` node inside the control**, with `aria-hidden="true"` on any
   decorative glyph. Rows 1, 2, 4, 8, 10.
3. **`aria-labelledby` + `aria-describedby`** where the control has data worth
   exposing as well as an action to name. Rows 6, 11, 12 — see §3.4, which is
   corrected from the earlier revision.

**Grounds, with the retracted one removed:**

- **Cost.** R1 adds no function. `biAttr()` is a second renderer that needs its
  own duplicated confirmed-gate and its own pin (§6 argues why duplication is
  correct there — which means the cost lands twice).
- **Two sites need no table entry at all**, and shape 1 keeps the accessible
  name equal to the visible label **structurally, forever**, including after a
  status flip. WCAG 2.5.3 Label in Name is satisfied by construction rather
  than by two strings being kept in sync by hand. `biAttr()` can match the
  visible label only as long as somebody remembers to use the same key.
- **It is the only way to fix the subtree-override defect** (§3.4), which is a
  live accessibility bug independent of Burmese and cannot be fixed while the
  name comes from `aria-label`.
- **`nameMy` reaches the user.** The tile's shape-3 conversion exposes the
  owner's own Burmese product name, which no attribute mechanism reaches
  without new call-site code.
- **Reversibility is symmetric and is no longer claimed.** Both `bi()` and a
  hypothetical `biAttr()` are single functions; either could be changed in one
  place later. The earlier revision claimed this as an R1 advantage. It is not.

**If AT verification comes back saying a mixed-language name is unusable**, the
answer is the same for R1 and for `biAttr()` — neither mechanism should render
a bilingual accessible name, and the question becomes which single language the
name carries, which is the language-setting pass §3.5 defers. R1 does not
prejudge that any more than `biAttr()` would; it is simply cheaper to reach
from, because the halves are still separate *in the source*, which is where a
future change would be made.

### 3.3 What R1 costs, stated so nobody discovers it mid-PR

- **`aria-hidden` is now load-bearing.** Today `aria-label="Close current sale"`
  overrides the `×` glyph. Remove it and the accessible name becomes
  `× Close current sale · <MY>` unless the `×` is hidden. The counter already
  hides `+` and `→` this way, so the pattern exists — but a missed
  `aria-hidden` is silent, invisible in review, and audible only to the one
  user who cannot see the screen. It needs a pin (§6).
- **Inline content concatenates without separators.** Measured: a button whose
  content is `<b>Rice 5kg</b><small lang="my">…</small><b>3500</b><small>12 in
  stock</small><span>2</span>` computes the name
  `"Rice 5kgဆန်350012 in stock2"` — run-together, unreadable, and a price
  fused to a stock count. Naive content-derived naming is not a drop-in
  anywhere the control has more than one child. This is why §3.4's
  recommendation changed.
- **`BarcodeScanButton` needs a prop split.** One `label: string` currently
  feeds `aria-label` twice and `title` once. Naming from content means the aria
  half becomes a node and the `title` half stays a string. This component has
  **five other call sites** (catalog SKU ×2, Plant job card, Plant material,
  counter), all outside the counter slice. It is the most expensive site in the
  census and may deserve its own PR, or deferral.

### 3.4 The subtree-override defect, and the right fix — CORRECTED 2026-08-21

`aria-labelledby` beats `aria-label`, which beats the element's contents. The
counter's product tile sets `aria-label` on the `<button>`, so its entire
subtree is overridden. A screen-reader user hears **"Add Rice 5kg to this
sale"** and hears **neither the price, nor the stock level, nor the quantity
already in the sale** — and never `item.nameMy`, the Burmese product name the
shop owner typed in themselves. The quantity badge carries its own `aria-label`
on a role-less `<span>` *inside* that override; it is part of no accessible
name and is not announced at all.

That finding stands. **The fix proposed in the earlier revision — "name the
tile from its contents" — was wrong**, and Codex was right to flag it: content
naming carries no verb, so a user tabbing between product tiles would never
learn that activating one adds it to the sale. The page heading is not part of
each button's name. It would have traded one defect for another. Measured, it
is worse than that: content naming at this site also produces the run-together
string in §3.3.

**Corrected recommendation — name the action, describe the data:**

- `aria-labelledby` → a hidden node carrying the action phrase, plus the
  existing product-name nodes.
- `aria-describedby` → the price, stock and quantity nodes.

Measured on the real shape:

| | Result |
| --- | --- |
| name | `"Add to this sale · ထည့်မည် Rice 5kg"` |
| description | `"3500 12 in stock 2 in sale"` |

(`ထည့်မည်` is the CONFIRMED `Add`, `i18n-actions.ts:42`; `Rice 5kg` is a
throwaway English fixture, not a catalogue entry.)

Three consequences worth having:

- **The action phrase becomes a STATIC key.** `Add to this sale` rather than
  `Add {name} to this sale`, because the name arrives from a separate
  referenced node. Same for `Add one` / `Remove one` at rows 11 and 12. **That
  removes rows 6, 11 and 12 from R2's dependency list** — three of the six
  parameterised attribute rows become ordinary Option B entries, and R2's
  attribute-side dependency drops to rows 7 (dead, to be deleted) and 14
  (brand-name frame).
- **Order is the author's, not the DOM's.** Measured:
  `aria-labelledby="verb name"` gives `"Add to this sale · ထည့်မည် Rice 5kg"`
  and `aria-labelledby="name verb"` gives `"Rice 5kg Add to this sale ·
  ထည့်မည်"` — the id list wins over document order.
- **And that creates a question only the reviewer can answer.** English wants
  the verb first; Burmese is verb-final. One flat name cannot do both, and the
  order is fixed at build time. This is the composed-label problem again, in
  the accessible name. It argues the action phrase should be **one whole table
  entry the reviewer writes as a unit**, never assembled from parts — which is
  Option B's rule, applied here. Added to the reviewer packet as part of
  question 5.

`aria-describedby` announcement is verbosity-dependent in most screen readers
and is on by default in the common configurations; that, like everything else
in §3.1, wants the AT verification before it is called done.

### 3.5 Rejected for problem 1 — restated after the §3.1 correction

- **`biAttr(en): string` returning `"English · Burmese"`.** The earlier revision
  rejected this because it produces an unmarked mixed-language accessible name.
  §3.1 measured that **R1 produces exactly the same name**, so that rejection is
  **withdrawn**. `biAttr()` is *not* worse than R1 in what an AT receives, and
  it shares R1's decisive practical property: it would reuse the same
  confirmed-only gate and fall back to English, so it too could ship ahead of
  sign-off. It is rejected now on the narrower grounds in §3.2 — a second
  renderer and a second pinned gate to maintain, no structural Label-in-Name
  guarantee, no route to the subtree-override fix, and no access to `nameMy` —
  and on the older ground that still stands untouched: it commits the product
  to a bilingual accessible name before anyone has asked whether that is
  wanted, whereas R1 reaches the same output through separate source halves
  that a later decision can act on. **That is a real but modest advantage, and
  it is stated here as modest.** If the AT verification in §3.1 comes back
  saying bilingual names are fine and `biAttr()` is materially cheaper for some
  batch, this document should not be read as forbidding it.
- **`aria-label` plus `lang="my"` on the element.** Measured in §3.1: same flat
  name, and the element language would claim the English half is Burmese.
  Strictly worse than doing nothing. Rejected outright.
- **Per-language attribute maps behind a language setting** (`aria-label={t(k)}`
  with one language selected). This is the only shape that gives a screen
  reader one clean language, and §3.1 raises rather than lowers its standing —
  if a mixed name proves unusable, this is where the answer lives. It requires
  the language setting #536 declined to add, whose reasoning (DESIGN-PROGRAM
  batch 3: what a Burmese-only till costs when ~70% of the app has no Burmese;
  whether owner and cashier want different answers on one device) is a
  founder/native question and its own planning pass. **Rejected as out of
  sequence, not on merit**, and now with a specific trigger for revisiting it:
  a negative result from §3.1's AT verification.
- **Sweeping all 446 app-wide sites.** Rejected: G1's whole sequencing argument
  is the counter slice first. 432 of those 446 are back office, Plant, Website
  and Ecommerce — the L scope, not the M.

### 3.6 The residue — 3 sites, not 4, and one correction to withdraw

The earlier revision listed four sites R1 cannot reach and deferred all four
behind a founder decision. **One of the four was deferred on a false
dependency, and this document asserted it as established.** Correcting it
explicitly rather than quietly, because it was relayed to the founder as fact:

> **WITHDRAWN:** "`placeholder="Guest"` has a code twin —
> `customer.trim() !== 'Guest'` gates the loyalty chip — so translating the
> displayed hint decouples it from the sentinel the code compares against …
> a *behaviour* change wearing a translation's clothes."

**That is wrong.** A `placeholder` never populates the controlled value. While
the hint is displayed, `customer` is `''` (CoreApp:1283, `value={customer}`,
state initialised from `restoredDraft?.customer ?? ''`). The guard at
CoreApp:1291 therefore only ever excludes a value a cashier literally *typed*
as `Guest`. Translating the hint cannot decouple anything, cannot reach the
sentinel, and cannot change loyalty behaviour. **`Guest` leaves the residue.**
It is an ordinary visible string awaiting an ordinary Option B table entry.

One true observation survives from the wrong one, and it is not a gate: `Guest`
**is** a live domain sentinel elsewhere — `CommercePage` substitutes
`customer.trim() || 'Guest'` for credit review (CoreApp:1636) and receipt
loyalty skips `customer === 'Guest'` (CoreApp:1959). So the value the system
stores and compares stays the English literal whatever the hint says. A
Burmese-first cashier who types a Burmese word for "guest" gets a named
customer rather than an anonymous one — **which is exactly as true today**, with
an English hint they may not read. Translating the hint does not create that
risk; it slightly reduces it. Worth a line in the batch that does it, not a
deferral.

**And the founder question does not belong to the residue at all.** §3.1
established that R1 and a string mechanism produce the same flat name, so
*"should a screen reader ever read a control's name in two languages?"* applies
to **every R1-converted control the moment its table entry is confirmed** — not
to three leftover sites. And §3.1a goes further: it does not wait for a
conversion either, because **7 already-confirmed strings render inside controls
on merged `main` today**. So the question is not a gate anyone is standing in
front of; it is an open question about behaviour already in front of users,
§3.1 names the check that answers it, and §3.1a names what to do if the answer
is bad.

**What is actually left, and why each is cheap:**

| Site | Is it an accessible name? | Status |
| --- | --- | --- |
| `placeholder="Search or scan SKU"` | **No** — the input's name comes from its `sr-only` label (CoreApp:1261) | Visual only. Not an AT question. Doubling it inside a 375px input is a **layout** question; the honest fix is to make the field's label visible and bilingual, which R1 already reaches. Ordinary table entry + a design pass. |
| `placeholder="Guest"` | **No** — the input's name comes from its wrapping `<label>`, which renders `bi('Customer')` | Visual only. Ordinary table entry. See the withdrawal above. |
| `title` on `BarcodeScanButton` | Duplicates the `aria-label`, which R1 converts | Hover tooltip on a device with no hover. Leave English; it reaches an AT through the aria half regardless. |
| `alt` on the QR image | **Yes** | The only genuinely AT-facing string R1 cannot reach. Parameterised on `{method}`, which batch 3 deliberately refused to translate, inside a dialog already labelled by `bi('Scan to pay')` + `<h2>{method}</h2>`. Subject to the same question 5 as every other name. |

So: **two visual-only strings that need nothing but a drafting batch, one
tooltip not reachable on the target device, and one genuine AT-facing string.**
Neither placeholder is founder-gated on the screen-reader question, because
neither is a screen-reader string.

### 3.7 Gating answer for problem 1 — corrected

- **Building and wiring R1: neither founder-gated nor native-speaker-gated.**
  Unchanged, and still the decisive practical property. R1 calls the same
  `bi()` under the same confirmed-only gate, so English renders until each line
  is signed off and the wiring lands first, exactly as #536's did. Rows 9 and
  14 need **no new table entries at all**.
- **Further `confirmed` flips of strings that become accessible names:
  founder-gated**, on question 5. **Corrected:** an earlier revision called this
  "the *first* such flip". There is no first — §3.1a enumerates 7 sites and 5
  distinct strings already live on merged `main`, 4 of them on the cashier path.
  So the AT check in §3.1 validates shipped behaviour and carries a remediation
  path (§3.1a), and question 5 gates *additional* exposure rather than the
  opening of it. R1 does not escape the question; neither does anything already
  merged.
- **The two placeholders: neither-gated.** Ordinary table entries; see §3.6.
- **The `title`: neither-gated, and recommended left alone** as not reachable
  on the target device.
- **The `alt`: founder-gated**, on the same question 5 as the rest.

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
every parameterised site for free, with no new review. (§3.4 makes three of
those sites static rather than parameterised, which shrinks what Option A would
buy here without changing the argument against it.) It is rejected for the
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
- **Item-name parameters — CORRECTED 2026-08-21: these are R1's job, not
  R2's.** An earlier revision told the R2 composer to interpolate
  `item.nameMy ?? item.name` for rows 6, 11 and 12. That contradicts §3.4,
  which moved those three rows onto R1's `aria-labelledby` path and turned
  their keys static; following both would rebuild the parameterised composer
  work this document's recommendation and sizing now exclude. **There is one
  mechanism for these sites and it is R1.** The product name reaches the
  accessible name because the referenced node *is* the name node — `nameMy`
  arrives as markup the counter already renders (`item.nameMy`, tile and cart
  line), with its own `lang="my"`, and no interpolation, no composer and no
  template are involved. `CommerceItem.nameMy` is real and validated
  (`commerce-workspace.ts:61`, `:2534`, `:6433`), it is optional, and most
  catalogues will not have it — in which case the referenced node is the
  English name, exactly as today.
  **What survives for R2** is the general principle, for any *future*
  item-name-parameterised string R2 genuinely does reach: prefer the data
  layer's own Burmese noun over interpolating English into a Burmese frame.
  On the counter slice after §3.4, that set is empty.
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
5. **`aria-labelledby` / `aria-describedby` id lockstep** for the §3.4
   conversion. A referenced id that is renamed or conditionally unrendered
   makes the accessible name silently fall back — to the run-together content
   string measured in §3.3, or to nothing. Verified 2026-08-21: **none of the
   §3.4 sites is currently pinned** (no verifier reference to `to this sale`,
   `Remove one`, `Add one`, `in sale`, `Sales counter` or `Close current
   sale`), so this is a new pin rather than a pin move, and the ids and their
   referencing attributes should be pinned as a pair.

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
5. **Two languages in an accessible name (founder), plus one ordering question
   for the native reviewer.** Should a screen reader ever read a control's name
   in two languages? **This is not a question about leftover sites.** §3.1
   measured that every mechanism — R1's nodes, a joined `aria-label`, even
   `lang` on the element — produces the same flat mixed-language string, so the
   question reaches **any** string that becomes an accessible name, R1's
   included. **And it is overdue, not upcoming:** §3.1a enumerates **7 such
   names already live on merged `main`** (5 distinct strings; 4 sites on the
   cashier path), shipped by #536. So the AT check in §3.1 validates behaviour
   that is already in front of users, and §3.1a defines the remediation path if
   it comes back negative — a one-line status flip per entry, cheap by
   construction but visible to users, hence a founder call on a marginal
   result. The reviewer's half: on a control whose name is
   `[action phrase] + [product name]`, English wants the verb first and Burmese
   is verb-final, and one flat name can carry only one order (§3.4). Which
   order, and is the compromise acceptable in the half they read?

---

## 8. Sizing, and what this does not close

**Sizing** (build effort only; review is separate and is the expensive half):

| Piece | Size | Ships before sign-off? |
| --- | --- | --- |
| R1, rows 1/2/8/9/10/14 (landmarks + icon buttons + the two zero-entry `aria-labelledby` conversions) | **S** — one PR, ~6 sites, 4 new table entries, 4 new pins | **Yes** |
| R1, rows 6/7/11/12 (tile + steppers: `aria-labelledby` for the action, `aria-describedby` for the data — the §3.4 bug fix, and it makes three keys static) | **S–M** — own PR; needs AT verification, not code reading | **Yes** |
| R1, rows 4/5 (`BarcodeScanButton` prop split, 5 out-of-slice call sites) | **M** — own PR, or defer with the residue | **Yes** |
| R2 mechanism + 2–3 pilot templates | **S–M** — one PR: composer, entry shape, pins, pilot sites | **Yes** |
| R2 content batches (the remaining ~13 templates) | **S** each | **Yes** |
| The 2 placeholders (ordinary table entries) + the `Guest` correction | **S** — a drafting batch; the search placeholder also wants a design pass on the visible label | **Yes** |
| The `alt` (1 site) | **not sized — founder-gated on question 5** | n/a |
| **AT verification (§3.1)** — validation of behaviour ALREADY SHIPPED (§3.1a), not a prerequisite | **S**, but needs a device and a screen reader this sandbox does not have | n/a — it is a check, not a ship |

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
- **Anything about how this sounds in a real screen reader.** Not tested; no AT
  in this sandbox, and W3C/MDN are blocked by this environment's egress proxy.
  What *was* measured is the browser boundary (Chrome 152 via the DevTools
  Protocol, §3.1 and §3.4) — the computed name, not the announcement.
- **Bilingual accessible names are already live and unverified** (§3.1a): 7
  sites, 5 distinct strings, 4 on the cashier path, shipped by #536. This
  document does not close that; it names it, sizes it, and defines what to do
  if the AT check goes against it. Running that check is the single most
  overdue item here.
- **R1's justification is now narrower than it was, and R1 itself is
  "recommended pending AT verification", not decided.** If the check in §3.1
  says a mixed-language name is unusable, the answer changes for every
  mechanism at once — R1, `biAttr()`, and the residue alike — and the real
  answer becomes the language-setting pass §3.5 defers. Nothing here should be
  read as having settled that.

**No Burmese was invented in this document.** Every Burmese string quoted above
is cited from source: `ပိတ်မည်` / `ရှင်းလင်းမည်` / `ထည့်မည်` / `ဖယ်ရှားမည်` are
confirmed entries in `i18n-actions.ts`; `အရောင်းဝန်ထမ်း ၁` is
`shop-service-scheduling.ts:129`; `KBZPay ပိုက်ဆံအိတ်` is the ledger string the
table's refusal note cites. Everything a reviewer has yet to write is
`<Burmese, pending>`.
