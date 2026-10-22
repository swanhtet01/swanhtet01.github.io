# Shop workspace compaction — design

Status: DESIGN ONLY. **The destructive half of this design — folding settled
orders out of the workspace — must not be implemented until the founder
approves this document.** Folding rewrites a customer's own business records:
after a fold, the shop's device no longer holds the individual sales it made,
only a summary of them. That is a decision about someone else's books, not a
refactor, and no build directive from any agent or operator overrides this gate.
Nothing in this file authorizes an implementation, a schema change, an
environment change, a migration on a live device, or a release.

The **non-destructive** parts of this design — the headroom meter (batch 1) and
the archive export (batch 2) — add no risk to stored data and may proceed
without waiting for that approval. They are separated deliberately so that the
useful, safe half ships while the destructive half waits.

Author: research batch, docs-only. Date: 2026-08-20.
Branch: `design/compaction-plan`. No application code was written in this batch.

---

## 1. What this document is

A shop that uses SuperMega without a hosted account keeps its entire commerce
workspace in the browser's local storage on one device. That workspace is a
single JSON document: the catalog, every order, every stock movement, every
daily close. It grows monotonically. Nothing in the product ever removes
anything from it.

There is a hard byte ceiling on that document. When the shop crosses it, the
till stops accepting new sales. This document verifies that claim against the
real source, measures the real numbers, maps every hazard in the way of fixing
it, and proposes a fix precise enough for implementation batches to follow.

Three findings changed materially during verification, and each is recorded in
its own section below:

1. The per-sale byte cost is **1,502 bytes**, not the 1,600 that was previously
   circulated, and the ceiling arrives at **1,390 sales**, not 1,300. The
   direction was right; the figures were conservative.
2. The referential trap that was previously identified — daily closes pointing
   at orders that must still exist — is real, but it is **not the first thing a
   naive fold hits**, and the error message it produces names a different part
   of the system entirely. An implementer working from the old description
   would be misled.
3. There is a **worse failure mode than the one previously identified**, and it
   is silent. One plausible fold shape passes every validation check, writes
   successfully, lets the shop keep trading normally, and permanently destroys
   the shop's ability to close a trading day. Nothing warns anybody. Section 6.3
   describes it in full, because it is the single most important thing in this
   document.
4. There is a **second ceiling** that nobody had been counting, and for one class
   of shop it caps what compaction can achieve. A shop using location inventory
   appends two entries per sale to a hash-chained command log that is hard-capped
   at 2,000 entries and **cannot be pruned by any amount of compaction**. Measured
   in section 7.5: the byte ceiling still binds first, so this design is sound,
   but compaction moves such a shop only from 731 sales to 999 rather than
   removing the wall. That gap needs its own design.

Everything below is cited to `file:line` in the worktree at commit `5d6217c2`.
Line numbers in `commerce-workspace.ts` were checked directly and are current.

---

## 2. The ceiling is real, and it bounds the whole workspace

`showroom/src/core/commerce-sync-outbox.ts:15` declares:

```
export const COMMERCE_SYNC_MAX_STATE_BYTES = 2 * 1024 * 1024
```

Two mebibytes: 2,097,152 bytes. That was previously reported correctly.

The important question is what those bytes are measured against — a single
change, or the entire workspace. It is the **entire workspace**, and this
changes the arithmetic completely. At `commerce-sync-outbox.ts:250-254`:

```
const baseRaw = JSON.stringify(validateCommerceState(input.baseState))
const candidateRaw = JSON.stringify(validateCommerceState(input.candidateState))
if (new TextEncoder().encode(candidateRaw).byteLength > COMMERCE_SYNC_MAX_STATE_BYTES) {
  throw new Error('The Shop workspace is too large for safe local recovery. Nothing was written.')
}
```

`input.candidateState` is a complete `CommerceState`. The check serializes the
whole post-change workspace and weighs it. The same check is applied again when
a saved recovery record is re-read, at `commerce-sync-outbox.ts:125`. So the
ceiling is not "no single sale may exceed 2 MB" — it is "the shop's entire
accumulated history may never exceed 2 MB", which is a very different and far
tighter constraint.

One detail in that code is the reason a fix is possible at all, and it is worth
stating early: **only `candidateRaw` is weighed. `baseRaw` is not.** A workspace
that is already over the ceiling can still successfully write a change whose
*result* is under it. Without that asymmetry there would be no way to compact
from inside the application, and the only remedy would be to throw the data
away. Section 9 depends on this.

---

## 3. What the shop actually costs, measured

### 3.1 Method

The figures below were produced by building sales through the same exported
transitions the user interface calls, not by estimating from type definitions.
The measurement script bundles `commerce-workspace.ts` with esbuild — the same
technique the repository's own contract tests use — and then, starting from
`createSeedCommerce()`, drives each sale through the real lifecycle:

`receiveCommerceStock` (restock so the run is not bounded by seed inventory) →
`reserveCommerceOrder` → `reconcileCommercePayment` → `advanceCommerceOrder`
three times, walking `confirmed → preparing → ready → completed`.

Every intermediate state is what `validateCommerceState` produced, so nothing
measured here is a state the product could not actually reach. Byte counts are
`new TextEncoder().encode(JSON.stringify(state)).byteLength` — exactly the
measure the ceiling check uses.

The run was 400 completed sales. The scripts live in this batch's scratchpad and
were not committed; the numbers are reproducible by re-running the same
sequence.

### 3.2 Results

| Measure | Value |
| --- | --- |
| Empty seed workspace | 9,008 bytes |
| **Per completed sale** | **1,502 bytes** |
| — of which the order record | 1,203.5 bytes |
| — of which its stock movement | 298.5 bytes |
| One completed order record, alone | 1,115 bytes |
| **Completed sales until the ceiling** | **1,390** |

The growth is exactly linear. Checkpoints at 100, 200, 300 and 400 sales came in
at 159,192 / 309,392 / 459,592 / 609,792 bytes — a marginal cost of 1,502.0
bytes per sale at every interval, with no drift. Restocking contributed 309
bytes across the whole 400-sale run, which is noise.

### 3.3 What this refutes and confirms

The previously circulated figures were roughly 1,600 bytes per sale and a
ceiling at roughly 1,300 sales. Both are **confirmed in substance and corrected
in detail**: the true figures are 1,502 bytes and 1,390 sales. The earlier
estimate was about 6% conservative. Nobody should re-plan around the difference
— a shop doing 40 sales a day still has about 35 trading days — but the numbers
in this document are the measured ones and should supersede the estimates.

The 80/20 split matters for design. The order records are 1,203.5 of the 1,502
bytes; their stock movements are the other 298.5. **A fold that removes orders
but leaves their movements behind recovers only 80% of the cost** — and, as
section 6 shows, would not validate anyway.

### 3.4 What a daily close costs by comparison

A close covering 401 orders occupies 5,593 bytes, of which 5,212 is the array of
order IDs it references. That is **13.9 bytes per order** — against 1,502 bytes
for the order itself. Folding an order into the close it already belongs to is
roughly a 99% saving on that order. This is what makes the whole approach worth
doing: the record the shop actually needs for its books is already there and
already cheap. The expensive part is the per-sale detail that duplicates it.

---

## 4. What happens when a shop reaches the ceiling

The failure path was previously described as "the till goes read-only". That is
accurate. The trace:

1. Every local write goes through `mutate()` in
   `showroom/src/core/workspace-runtime.ts:600`. At line 618 it calls
   `stageLocalCommerceSyncIntent` — the crash-recovery staging step — **before**
   it touches local storage at line 644.
2. Staging is where the size check lives, so the ceiling gates every write, not
   just large ones.
3. When it throws, `workspace-runtime.ts:625-629` catches it, sets the sync
   status to `'unavailable'` carrying the message *"The Shop workspace is too
   large for safe local recovery. Nothing was written."*, and rethrows.
4. On the next attempt, `workspace-runtime.ts:610` refuses before doing any work:
   `if (syncStatusRef.current.status !== 'ready') throw new Error(...)`.

So the first oversized write fails, and every subsequent write in that session
is refused at the gate. Reloading the page resets the status to `'ready'`,
because `recoverLocalCommerceSyncOutbox` reports ready when no recovery records
are pending — but the next write immediately re-fails for the same reason. The
practical effect for the owner is a till that will not take a sale, with a
message about "local recovery" that does not obviously mean "your workspace is
full".

There is no headroom indicator anywhere in the product. A search for byte
accounting in the user interface found size checks in the client import, the
company backup and the website lead ledger, but **nothing that shows the shop
how full its commerce workspace is**. The ceiling arrives without warning.

### 4.1 The existing remedy, described accurately

It was previously said that the only in-app remedy is a reset that destroys all
history. That is **partly refuted**. The reset exists, at
`showroom/src/core/WorkspaceControlsPage.tsx:598-624`, and it does clear every
local workspace key at line 619. But it refuses to run without first staging a
restore point (`WorkspaceControlsPage.tsx:604-605`), and a downloadable backup
of the whole workspace is offered at `WorkspaceControlsPage.tsx:681`. The backup
format is capped at 5 MiB
(`showroom/src/core/local-workspace-backup.ts:16`), comfortably above a 2 MiB
workspace, so the history genuinely can be preserved as a file.

What remains true, and is the real problem: **restoring that backup restores the
same oversized workspace, so the till is read-only again immediately.** The
owner can keep their history or keep trading, but not both. The history is not
destroyed; it is stranded. That is a better situation than "destroyed" and a
worse one than "fine", and the design should be honest about which.

### 4.2 Scope: this affects unmanaged devices only

The ceiling is enforced only on the browser-local path. `workspace-runtime.ts:606`
branches on `if (!managedIdentity)`, and the managed path from line 686 onward
sends commands to the server through `saveManagedCommerceCommand` without any
size check. A shop on a hosted account does not have this problem. Everything in
this document concerns devices running the local workspace.

---

## 5. Is there a schema or version marker to migrate against?

Partly, and the gap matters.

`commerce-workspace.ts:28` defines
`COMMERCE_WORKSPACE_SCHEMA = 'supermega.commerce.workspace.v2'`, which every
state carries in its `schema` field, and `commerce-workspace.ts:42` lists two
superseded storage keys in `LEGACY_COMMERCE_KEYS`. So there is a schema
*identity*, and there is a precedent for migrating between generations.

What does not exist is a **revision number inside the state**. `CommerceState`
(`commerce-workspace.ts:1265-1287`) has no version, revision, or
last-compacted-at field. Nested records have revisions — the inventory envelope
has one at `commerce-workspace.ts:2417` — but the workspace itself does not.
There is therefore no way to ask a workspace "have you been compacted, and to
what generation?" except by inspecting its shape. Any compaction design must add
such a marker, or accept that future migrations will have to infer state from
structure, which is exactly how workspaces get corrupted.

The migration precedent to follow is `upgradeCommerceSeedPolicies`
(`commerce-workspace.ts:2349`), which runs inside `loadCommerceWorkspace` at
line 4617 and rewrites the stored workspace in place on open. Section 10 returns
to this, including a hazard in that path.

---

## 6. The trap

This is the section an implementer must not skim.

### 6.1 Where validation runs: on read AND on write

Both. This decides everything about how a bad fold fails.

- **On write**, `mutateCommerceWorkspace` validates the current state at
  `commerce-workspace.ts:4675` and the proposed next state at
  `commerce-workspace.ts:4680`. If the proposed state fails, it returns
  `{ ok: false, error: 'The proposed Commerce state failed integrity checks. Nothing was written.' }`
  and nothing is persisted.
- **On read**, `loadCommerceWorkspace` validates at
  `commerce-workspace.ts:4616`. On failure it returns an **empty workspace** at
  `commerce-workspace.ts:4622` with the message *"Commerce v2 data is malformed.
  Recovery failed closed without restoring or replacing older data."* The stored
  data is not deleted — but the owner opens their till and sees nothing.
- **On the write probe**, `commerceWorkspaceCanWrite` validates at
  `commerce-workspace.ts:4651` and returns `false` if the state is invalid,
  which puts the workspace into read-only mode.

The good news is that `mutateCommerceWorkspace` is a genuinely safe harness. A
fold that breaks referential integrity **cannot be persisted through it** — the
write is rejected before it lands. This corrects the earlier framing that "the
very next write fails outright": in fact *the fold's own write* fails, and it
fails safely, leaving the workspace exactly as it was.

The bad news is section 6.3.

### 6.2 The referential checks, and the one that fires first

The previously identified trap is at `commerce-workspace.ts:4189`:

```
if (orderIdsForClose.some((orderId) => !orderIds.includes(orderId))) throw new Error(`closes[${index}] references an unknown closed order.`)
```

That is real and current — the line number had not drifted. Its sibling at
`commerce-workspace.ts:4190` applies the same rule to
`paymentExceptionOrderIds`. `CommerceClose.orderIds` is declared at
`commerce-workspace.ts:642`.

But dropping settled orders while leaving the closes intact does **not** produce
that error. It was tested directly, and the actual rejection is:

```
movements[0] does not match its order reservation.
```

thrown from `commerce-workspace.ts:3999-4002`, where every stock movement's
`orderId` is resolved against the live orders array. The movements are validated
before the closes, so **the movements are the first tripwire**, and the error an
implementer will actually see names a subsystem the old description never
mentioned. Someone debugging from the earlier note would go looking at close
validation and find nothing wrong with it.

The close block hides three further requirements that a fold must satisfy, all
of which are easy to miss because they are not phrased as reference checks:

- **`close.total` and `close.orders` are re-derived from the live orders on
  every validation** (`commerce-workspace.ts:4197-4204`). The close does not
  merely point at its orders; its own stored totals are recomputed from them and
  compared. A close is not a self-contained record today.
- **The settlement block is re-derived too**
  (`commerce-workspace.ts:4220-4225`), building the expected cash-by-payment-
  method breakdown from each live order's `payment` field. A close that has been
  settled carries an even deeper dependency on its orders.
- **New fields on a close are rejected outright.** `hasExactKeys` at
  `commerce-workspace.ts:4164-4168` allows only a fixed key set. Adding, say, a
  `foldedOrders` array to a close fails with `closes[0] is invalid.` — tested
  and confirmed. **Any fold shape requires a validator change; there is no way
  to sneak a summary into the existing schema.**

One more structural rule shapes the options. `closeSnapshotFields`
(`commerce-workspace.ts:1560`) lists eight fields — `businessDate`, `orderIds`,
`paymentExceptionOrderIds`, `stockExceptionSkus`, `actionId`, `operator`,
`reason`, `evidenceReference` — and `commerce-workspace.ts:4173-4176` enforces
that a close carries **either all eight or none**. A close with none of them is
a valid legacy shape. That fact is the trapdoor in the next section.

### 6.3 The silent catastrophe

Because a close with no snapshot fields is legal, there is an obvious-looking
fold: drop the settled orders, drop their movements, and reduce each close to
the bare legacy shape of `id`, `createdAt`, `total`, `orders`.

**This passes validation.** It was tested. A 40-sale day compacted from 69,961
bytes to 7,968 — a 99% saving — and `validateCommerceState` accepted it without
complaint. It would be written to local storage successfully. The till would
reload cleanly. The shop would go on selling: ten further sales were recorded
against the compacted workspace with no error of any kind.

And then the shop would try to close the next trading day, and could not. Not
that day — **ever again.**

`commerceCloseExpectation` at `commerce-workspace.ts:9474` begins:

```
if (current.closes.some((close) => !close.orderIds || !close.businessDate)) return null
```

One close missing its `orderIds` makes every future close expectation `null`,
permanently, for the life of that workspace. Measured directly: the compacted
workspace returned `null`; the identical uncompacted workspace returned a normal
expectation for the same day. There is no error, no warning, and no message —
the daily close simply stops being offered.

The general ledger fails the same way and just as quietly.
`showroom/src/core/shop-ledger-journal.ts:132` opens with
`if (!close.businessDate || !close.orderIds) return []`, so a bare close
contributes **no journal entries at all** for its day. And at
`shop-ledger-journal.ts:139-140`, orders that cannot be resolved are skipped with
a bare `continue` — the journal totals silently shrink rather than raising
anything.

This is the difference that matters most in the whole document. The trap
identified earlier fails **loudly and safely**: the write is rejected, nothing
changes, someone investigates. This variant fails **quietly and permanently**:
the write succeeds, the data is gone, the damage is invisible for however many
days pass before the owner next tries to close their books — and by then the
archive of what was folded may be the only copy left.

**No implementation may use the bare-close shape.** Whatever else is decided,
`close.orderIds` and `close.businessDate` must survive every fold.

---

## 7. Complete inventory of order back-references

A fold that satisfies closes but orphans something else is not a fix. This is
the full surface, assembled by sweeping the source for every field that stores
an order ID and every path that resolves one.

Findings marked **[executed]** were confirmed by running code in this batch.
Findings marked **[read]** were confirmed by reading the source but were not
exercised; they should be treated as accurate but not proven.

### 7.1 Records that persist an order ID inside `CommerceState`

This is the critical list — everything here is orphaned by a fold.

| Field | Location | Lives in | Status |
| --- | --- | --- | --- |
| `CommerceStockMovement.orderId?` | `commerce-workspace.ts:611` | `state.movements` | **[executed]** |
| `CommerceClose.orderIds?` | `commerce-workspace.ts:642` | `state.closes` | **[executed]** |
| `CommerceClose.paymentExceptionOrderIds?` | `commerce-workspace.ts:643` | `state.closes` | **[read]** |
| `CommerceWebsiteIntake.conversion.orderId` | `commerce-workspace.ts:934` | `state.websiteIntakes` | **[read]** |
| `ShopInventoryCommandPayload<'order_reserve'>.orderId` | `shop-inventory-foundation.ts:107` | `state.inventoryFoundation.commands` | **[read]** |
| `ShopInventoryCommandPayload<'order_release'\|'order_fulfil'>.orderId` | `shop-inventory-foundation.ts:108` | same | **[read]** |
| `ShopInventoryCommandPayload<'order_return'>.orderId` | `shop-inventory-foundation.ts:109` | same | **[read]** |

Records nested *inside* a `CommerceOrder` — returns (`:285`), support cases
(`:364`), corrections (`:310`), collection actions (`:327`) — travel with the
order and are not orphaned. They are, however, part of what the fold destroys,
which is a separate concern for section 8.

### 7.2 Hard-fail validation: these turn a bad fold into a rejected write

- `commerce-workspace.ts:3999-4002` — every movement's `orderId` must resolve
  and its quantity must match the order's line. **First tripwire. [executed]**
- `commerce-workspace.ts:4189` — every `close.orderIds` member must exist. **[read]**
- `commerce-workspace.ts:4190` — same for `paymentExceptionOrderIds`. **[read]**
- `commerce-workspace.ts:4197-4204` — `close.total` and `close.orders`
  recomputed from live orders. **[read]**
- `commerce-workspace.ts:4220-4225` — settlement recomputed from live orders'
  payment methods. **[read]**
- `commerce-workspace.ts:4339-4355` — a website intake's conversion must resolve
  to exactly one live order **and** its matching reserve movement, or it throws
  `websiteIntakes[N] does not match its converted Website order.` This means
  **orders from the Website channel cannot be folded without also handling their
  intake record.** **[read]**

### 7.3 Silent-degradation paths: these turn a valid fold into invisible damage

These are more dangerous than the hard failures, for the reason section 6.3
gives.

- `commerce-workspace.ts:9474` — one close without `orderIds` disables the daily
  close forever. **[executed]**
- `shop-ledger-journal.ts:132` — a close without `orderIds` or `businessDate`
  emits no journal entries for its day. **[read]**
- `shop-ledger-journal.ts:139-140` — unresolvable orders are skipped with
  `continue`; ledger totals shrink without error. **[read]**
- `showroom/src/core/shop-loyalty.ts:435-437` — customer point balances are
  derived on every read by scanning completed, reconciled orders. The module
  header states explicitly that nothing is persisted outside the commerce
  workspace. **Folding completed orders zeroes every customer's loyalty
  balance.** **[read]**
- `commerce-workspace.ts:9520-9526` — `buildCommerceCloseSettlement` returns
  `null` when an expected order is missing; the settlement simply becomes
  unbuildable. **[read]**
- `commerce-workspace.ts:9684-9686` — `commerceDailyCloseExport` casts
  `orderById.get(orderId) as CommerceOrder` without a null check. **[executed:
  the export returns `null` on a folded state — see section 9.2.]**
- `shop-production-status.ts:41-52`, `plant-shop-demand-coverage-brief.ts:29-30`,
  `cross-product-report.ts:25-26` — production and cross-product coverage
  figures are computed by intersecting stored order-ID lists with live orders;
  all skew after a fold. **[read]**

### 7.4 Order IDs persisted outside `CommerceState`

These stores are not validated by `validateCommerceState`, so a fold cannot
break them — but it will leave them pointing at orders that no longer exist.

- `showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts:444, 485, 524,
  576, 600, 630, 659` — return, support, correction, cancellation, amendment and
  reschedule intents, each carrying an `orderId`, persisted in a separate store
  with its own digest chain. **[read]**
- `showroom/src/core/production-workspace.ts:61` and `:42` —
  `ProductionJob.shopDemandSource.snapshot.sourceOrderIds`, validated for
  uniqueness and sort order at `production-workspace.ts:847-850`. **[read]**

### 7.5 A second, harder ceiling — measured

This did not come from the earlier findings. It was flagged during this batch as
possibly mattering more than the byte ceiling, and then measured. The result
changes what compaction is worth for one class of shop.

`commerce-workspace.ts:2422` rejects any workspace whose location-inventory
command log exceeds 2,000 entries:

```
|| inventory.commands.length > 2_000
```

Every order reservation and fulfilment appends commands to that log, and the
command identifiers are **digests of the order ID itself**
(`shop-inventory-foundation.ts:1604`, `:1609`, `:1619`), chained through
`previousDigest`/`headDigest`. A hash chain cannot be rewritten or pruned
without invalidating everything after it, so **compaction cannot reclaim a
single byte of this log.**

**Measured [executed].** A workspace was stood up with a real location-inventory
foundation — an opening import built through `buildShopInventoryImportPackage`
and applied with `applyShopInventoryImport`, attached to the seed state and
validated — then driven through the same sale lifecycle used in section 3.

| Measure | Value |
| --- | --- |
| Command-log entries per completed sale | **exactly 2.000** (`order_reserve`, `order_fulfil`) |
| Command-log bytes per entry | 654.5 |
| Bytes per sale, inventory-enabled shop | **2,850.8** (against 1,502 without) |
| Sales until the 2,000-command wall | **999** |
| Sales until the 2 MiB byte wall | **731** |

The cap is genuinely enforced: a padded 2,001-command log is rejected by
`validateCommerceState` with *"Commerce location inventory envelope is
invalid."*

**Which ceiling binds, and what compaction is actually worth here.** Today the
byte ceiling binds first, at 731 sales. So compaction *is* addressing the real
constraint and this design is not built on a wrong premise. But the picture
*after* compaction is the part that matters:

- A shop **without** location inventory: compaction removes essentially all of
  the per-sale cost, moving the wall from 1,390 sales to far beyond it.
- A shop **with** location inventory: compaction removes the order and movement
  bytes but leaves the command log, whose 1,309 bytes per sale (2 × 654.5) it
  cannot touch. The byte wall moves out past 1,500 sales — and the **999-sale
  command wall becomes binding instead.**

So compaction takes an inventory-enabled shop from **731 sales to 999** — a
useful 37% gain, not the order-of-magnitude gain it delivers elsewhere. And at
999 sales that shop hits a wall this design has **no remedy for at all**,
because the log is a hash chain.

**That needs its own answer, and it is out of scope here.** Whatever it turns
out to be — checkpointing the chain, raising the cap, or moving
location-inventory shops to hosted storage — it is a separate design and a
separate decision. It should not delay compaction, which helps both classes of
shop. But it must not be forgotten: for inventory-enabled shops, compaction buys
roughly 270 more sales and then the problem returns in a harder form.

---

## 8. The proposed fold

### 8.1 Shape

Given section 6.3, the fold cannot discard `orderIds`. Given section 6.2, it
cannot add fields without a validator change. So the shape is:

A close keeps all eight snapshot fields exactly as today — including its full
`orderIds` array, which costs only 13.9 bytes per order — and gains **one new
optional field**, `foldedOrders`, carrying the minimum per-order facts that the
rest of the system re-derives from live orders today:

- `id` — so the close's membership stays traceable
- `payment` — required by settlement re-derivation (`:4220-4225`)
- `adjustedTotal` — required by close total re-derivation (`:4197-4204`)
- `customer` — required by loyalty accrual (`shop-loyalty.ts:435-437`)
- `createdAt` and `paymentReconciledAt` — required by the ledger journal

`CommerceOrder` is 1,115 bytes; this summary should be well under 200. The exact
size must be measured during implementation, not assumed.

An order appears in `foldedOrders` **if and only if** it is absent from
`state.orders`, so the two can never disagree.

The workspace also gains a compaction generation marker, per section 5, so that
a later migration can tell what shape it is looking at.

### 8.2 What validation must be taught

Each of these is a change to `validateCommerceState` and must be paired with a
test that fails without it:

1. `hasExactKeys` at `:4164-4168` must accept `foldedOrders`.
2. `:4189` and `:4190` must accept an order ID that resolves to either
   `state.orders` **or** `close.foldedOrders`, and must reject one that resolves
   to both or to neither.
3. `:4197-4204` must derive `close.total` and `close.orders` from the union of
   live and folded members.
4. `:4220-4225` must build the expected settlement breakdown from that same
   union.
5. `:3999-4002` must not require an order for a movement whose order has been
   folded — but see 8.3: the preferred answer is that such movements do not
   survive the fold either.
6. `commerceCloseExpectation` at `:9474` keeps working unchanged, because
   `orderIds` still exists. This is the whole reason for the chosen shape.

### 8.3 What must be excluded from folding

An order is **not eligible** to be folded if any of the following hold. These
are eligibility rules, not error cases; ineligible orders simply stay.

- It is referenced by a website intake conversion (`:4339-4355`) — folding it
  breaks a hard validation check.
- It is referenced by an unresolved ecommerce buying-lifecycle intent
  (section 7.4).
- It is referenced by a production job's demand snapshot (section 7.4).
- It has an open support case, an unsettled refund, or a correction posted after
  its close.
- Its close has not yet been exported to an archive file (section 9).

Its stock movements are folded **with** it, because leaving them behind is both
invalid (`:3999-4002`) and pointless — they are 20% of the byte cost. The
location-inventory command log is **never** touched, for the hash-chain reason
in section 7.5.

---

## 9. The transition algorithm

### 9.1 Everything happens in one transition

`mutateCommerceWorkspace` validates the proposed state before writing
(`:4680`). Anything the algorithm does across two transitions is a state the
validator will reject in between. So the archive export, the order removal, the
movement removal and the close rewrite are **one** `transition` function.

### 9.2 The archive must be produced before the fold, not after

Tested: `commerceDailyCloseExport` returns `null` when run against a state whose
closed orders have been folded away. The export artifact — 401 orders produced a
21,592-byte artifact and a 17,345-byte CSV in a 41-order test — **can only be
built while the orders still exist.**

The mechanism largely exists already. `showroom/src/core/CoreApp.tsx:1647-1651`
builds a daily close export and offers it as a CSV download today. Batch 2 makes
that export reliable and explicitly archival rather than incidental.

The ordering is therefore: build and hand the owner the archive file, confirm
they have it, and only then fold. Never the reverse, and never in separate
sessions where a crash between the two loses the detail permanently.

### 9.3 The escape hatch works

A shop at the ceiling can still run the compaction, because
`commerce-sync-outbox.ts:252` weighs only the candidate state. Confirmed by
construction: a folded state measured 7,968 bytes, far under the ceiling, and
would stage normally from an oversized base.

One constraint follows from `workspace-runtime.ts:610`. Once a write has failed,
the sync status is `'unavailable'` and **every** subsequent write is refused —
including the compaction. So the compaction action must be reachable on a freshly
loaded page, before the owner attempts a sale. The user interface must therefore
surface it at load time when the workspace is near or over the ceiling, not bury
it behind an action that itself needs a write.

---

## 10. Migration for devices already running

There is a live pilot shop. It is referred to here only as "the pilot shop";
examples in this document use fictional names.

The precedent for rewriting a stored workspace on open is
`upgradeCommerceSeedPolicies` (`commerce-workspace.ts:2349`), invoked from
`loadCommerceWorkspace` at line 4617. It is tempting to hang compaction off the
same hook. **There is a hazard in that path that must be stated plainly.**

`persistInitialState` (`commerce-workspace.ts:4599-4603`) writes
`JSON.stringify(state)` to local storage **without re-validating it**. It is the
one write path in the module that does not go through the
validate-before-write guard at `:4680`. `upgradeCommerceSeedPolicies` is safe
only because it validates its own output before returning
(`commerce-workspace.ts:2386`). Any compaction migration placed on the load path
inherits that obligation, and if it fails to meet it, an invalid workspace gets
persisted — at which point `loadCommerceWorkspace` shows the owner an empty till
on every subsequent open (`:4616`, `:4622`). **This is the one place in the
system where a bug can actually brick a device rather than fail closed.**

The recommended migration is therefore **not** automatic:

1. Devices update to a build that has the extended validator and can *read* a
   compacted workspace. Nothing is folded. This build is deployed and left to
   settle, so that a device which is later compacted can never be opened by a
   build that would reject it.
2. Compaction is offered as an explicit, owner-initiated action with the archive
   download in front of it. No workspace is folded without someone choosing it.
3. Only after that has proven itself on real devices should any automatic
   threshold-triggered fold be considered, and that is a separate decision
   requiring its own founder approval.

Doing step 2 before step 1 has reached a device would produce a workspace its own
build cannot read. The ordering is not optional.

---

## 11. Reversibility

A fold is reversible from the archive, and this was verified rather than assumed.
Restoring the folded orders, their movements and the original closes to a
compacted workspace produced a state that re-validated and was **byte-identical**
to the pre-fold workspace.

That is the good half. The honest half:

- Reversal is only as good as the archive file. If the owner lost the download,
  the detail is gone. Nothing in the browser retains it after the fold.
- The current archive is a **CSV built for accountants**, not a restore format.
  It carries the fields the daily-close export defines
  (`CommerceDailyCloseExportOrder`, `commerce-workspace.ts:705`), which is not
  the same set as `CommerceOrder`. Reversal from today's CSV would be lossy.
  **A true undo requires the archive to be a lossless JSON record of the folded
  orders and movements, which is a design decision this document is
  recommending, not describing.**
- There is no in-product import path for such an archive today. Building one is
  its own batch and its own risk surface — an import that writes orders back
  into a workspace is exactly the kind of thing that needs the same validation
  care as the fold.

What the owner would actually have to do, if reversal were built: open workspace
controls, choose restore-from-archive, select the archive file, and confirm. What
they can do **today**, with no further work: download a full workspace backup
before compacting (`WorkspaceControlsPage.tsx:681`), which preserves everything
byte-for-byte and can be restored through the existing restore flow. **Batch 2
should make taking that backup a required step in the compaction flow**, because
it gives a real undo on day one without waiting for an archive importer.

---

## 12. Implementation plan

Batches 1 and 2 are non-destructive and may start now. **Batches 3 onward must
not start until the founder approves this document.**

**Batch 0 — measure the location-inventory command ceiling. DONE in this batch.**
Two command-log entries per completed sale; the 2,000-command wall at 999 sales;
the byte wall at 731 for an inventory-enabled shop. The byte ceiling binds first
today, so this design addresses the right constraint — but compaction moves an
inventory-enabled shop only from 731 sales to 999, after which the unpruneable
command log stops it for good. Full result and its consequences in section 7.5.
**The command-log wall needs a separate design; it should not block this one.**

**Batch 1 — the headroom meter.** Compute the workspace's serialized size against
`COMMERCE_SYNC_MAX_STATE_BYTES` and show it, with a warning well before the
ceiling. Reads only; writes nothing. Ships value immediately: today the ceiling
arrives with no warning at all.

**Batch 2 — the archive export and the pre-flight backup.** Make the daily-close
archive a first-class, lossless artifact rather than an accountant's CSV, and
make taking a full workspace backup a required step before any future
compaction. Adds no state fields and removes nothing.

**Batch 3 — teach the validator the folded shape.** Extend
`validateCommerceState` per section 8.2, plus the compaction generation marker
from section 5. Ships a build that can *read* compacted workspaces without any
code that *creates* one. This is the build that must reach devices first,
per section 10.

**Batch 4 — the fold transition.** The eligibility rules in section 8.3 and the
single-transition algorithm in section 9. Not offered in the interface yet.
Tested against: the movement tripwire, the close-reference checks, the settlement
re-derivation, the website-intake check, the loyalty balance before and after,
and the ledger journal before and after.

**Batch 5 — the owner-facing compaction action.** Reachable on a freshly loaded
page per section 9.3, archive-and-backup first, with a plain statement of what
is about to be removed and what will remain.

**Batch 6 — archive restore.** Only if reversal is wanted as a product feature
rather than as the backup-file fallback described in section 11.

Every batch that touches `validateCommerceState` should expect the four-site pin
cascade that trial-store edits are known for in this codebase, and every new test
tool must be wired into `app:verify` or it will never run in CI.

---

## 13. What could not be verified

Listed as unverified rather than estimated, per the rules of this batch.

- **Whether the fold validates for a workspace that *does* have a location
  inventory foundation.** Such a workspace was built and validated for the
  section 7.5 measurement, but the fold itself was only exercised on a workspace
  without one. `validateCommerceState` does not cross-check inventory
  reservations against `state.orders` — it checks the projection against the
  catalog and against supplier policies only
  (`commerce-workspace.ts:4492-4518`) — so the fold should validate. That is an
  inference from reading plus a partial measurement, not a direct test.
- **The byte size of the proposed `foldedOrders` summary record.** Estimated
  under 200 bytes against a 1,115-byte order, but the shape does not exist yet
  and was not built or measured.
- **Whether the pilot shop is running the local workspace or a hosted account.**
  This document did not inspect any customer's device or data, and the ceiling
  applies only to the local path (section 4.2). Someone with that knowledge
  should confirm whether the pilot shop is exposed at all before this work is
  prioritized.
- **Behaviour of the seven ecommerce buying-lifecycle intent stores and the
  production job demand snapshots after a fold.** Identified by reading
  (section 7.4); not exercised.
- **Loyalty balance behaviour after a fold.** The mechanism is clear from
  `shop-loyalty.ts:435-437` and the module header, and the conclusion that
  balances zero out follows directly, but no loyalty-enabled workspace was
  folded and measured in this batch.
