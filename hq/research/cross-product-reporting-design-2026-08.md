# Cross-Product Reporting Design

Date: 2026-08-11
Author: Agent Operations / CEO review
Status: design-in-progress
Gate: adopt-with-managed-mode

---

## Problem

The four SuperMega products — Shop, Plant, Website, Ecommerce — already share data through a set of typed bridges. A Shop order stamps its IDs onto a Plant job. A Plant material issue lands in a Shop stock movement. An Ecommerce draft arrives in the Shop queue from a Website lead. But operators see none of these connections at runtime. Each product renders its own state in isolation. An operator in Plant cannot see which Shop orders their job fulfills. An operator in Shop cannot see whether the Plant job covering their demand is on track.

Cross-product reporting closes that gap without changing the operating model: the bridges already exist as read-only projections; the reporting layer makes them visible.

---

## Existing bridge topology

The full chain is already implemented in types and validators. Nothing needs to be invented.

```
Website leads
     │  supermega.website-ecommerce-handoff.v1
     ▼
Ecommerce quote   EcommerceShopDraft  (ecommerce-shop-handoff.ts)
     │  readLatestEcommerceShopDraft() → catalog match
     ▼
Shop order        CommerceOrder  (commerce-workspace.ts)
     │  projectShopProductionDemand() → sourceOrderIds on ProductionJob
     ▼
Plant job         ProductionJob.shopDemandSource  (production-workspace.ts)
     │  productionMaterialHandoffs() → CommerceStockMovement
     ▼
Shop inventory    CommerceStockMovement (kind: production_receipt)
```

### Bridge file index

| Bridge | File | Key types |
|--------|------|-----------|
| Shop → Plant demand | `shop-production-demand.ts` | `ShopProductionDemandSignal`, `projectShopProductionDemand()` |
| Plant job ← Shop | `production-workspace.ts` | `ProductionShopDemandSource`, `shopDemandSource` on `ProductionJob` |
| Plant → Shop materials | `production-material-handoff.ts` | `ProductionMaterialHandoff`, `productionMaterialHandoffs()` |
| Commerce stock movements | `commerce-workspace.ts` | `CommerceStockMovement` (kinds: `production_issue`, `production_return`, `production_receipt`) |
| Ecommerce → Shop handoff | `ecommerce-shop-handoff.ts` | `EcommerceShopDraft`, `recordEcommerceShopDraft()` |
| Identity + auth shared | `managed-trial.ts` | `ManagedIdentity` (gates all four products) |

### What each bridge carries today

**Shop → Plant demand** (`ShopProductionDemandSignal`):
- `operatingContext.sourceAuthority: 'commerce'`, `targetAuthority: 'production'`
- `sourceOrderIds: string[]` — the exact Commerce order IDs driving the demand
- `sku`, `productName`, quantity fields (active, uncovered, ATP, reorderAt, replenishment gap, recommended batch)
- Stamped on the Plant job as `shopDemandSource.snapshot` with a `sha256:` source digest and `SHOP-DEMAND:{digest}:LOC-MAIN` evidence reference

**Plant → Shop materials** (`CommerceStockMovement`):
- `productionJobId`, `productionMaterialId`, `productionInputLotId`, `productionQuantityMilli`
- `productionReleaseId`, `productionOutputBatchId`, `productionSourceProduct`
- Kind: `production_issue` (material pulled from Shop), `production_return`, `production_receipt` (goods back into Shop stock)

**Ecommerce → Shop**:
- `EcommerceShopDraft` carries the `sourceRequestId`, customer reference, fulfilment type, line items, price, and an `evidenceReference` binding the Ecommerce order request to the Shop draft
- Validated against the live Commerce catalog (SKU, variant, price, stock) before the Shop order is created

---

## Reporting use cases

### Use case 1 — Order status trail (Shop → Plant)

**Who uses it**: Shop operator checking whether a placed order is being produced.
**Question**: "Order C-0123 is for 40 units of Widget A. Is Plant making them?"

**What already exists**:
- The Plant job created from that demand has `shopDemandSource.snapshot.sourceOrderIds` containing `'C-0123'`
- The job carries its current `output`, `target`, and optional `closure`
- The job also carries open `qualityHold` and `maintenanceFindingSource` flags

**Reporting output** (read-only projection from Plant state):
```
Shop order: C-0123  SKU: WIDGET-A  Demand: 40 units
Plant job:  JOB-044  Line: Assembly A  Target: 40 units
Status:     In progress  Output: 28 good  Scrap: 2
Schedule:   Priority: high  Due: 2026-08-14 08:00
Blockers:   None
```

**Implementation**: `projectShopOrderProductionStatus(commerceState, productionState)` — for each `CommerceOrder`, find any `ProductionJob` whose `shopDemandSource.snapshot.sourceOrderIds` includes that order ID. Return job status fields. No new types needed; pure read-only projection function in a new file `shop-production-status.ts`.

---

### Use case 2 — Materials reconciliation (Plant ↔ Shop)

**Who uses it**: Shop or Plant operator verifying material flows.
**Question**: "How much of SKU RAW-STEEL has Plant pulled from Shop this shift?"

**What already exists**:
- `CommerceStockMovement` records with `kind: 'production_issue'` carry `productionJobId` and `productionQuantityMilli`
- `productionMaterialHandoffs()` already projects these movements onto Plant BOM requirements

**Reporting output** (read-only projection from Commerce state):
```
Material: RAW-STEEL
  Total issued to Plant today:  4,200 g  (3 movements)
  Total returned from Plant:      200 g  (1 movement)
  Total receipts from Plant:    3,800 g finished (2 movements)
  Net:                            200 g still in process
```

**Implementation**: `projectMaterialReconciliation(commerceState, date)` — aggregate `CommerceStockMovement` by `kind` and `sku` for a given day. Already fully achievable from Commerce state alone.

---

### Use case 3 — Ecommerce conversion path (Website → Ecommerce → Shop)

**Who uses it**: Business owner reviewing how Website leads convert to orders.
**Question**: "How many Website leads became Ecommerce quotes this week? How many became Shop orders?"

**What partially exists**:
- `supermega.website.leads.v1` stores Website lead records
- `EcommerceShopDraft` carries the `sourceRequestId` linking an Ecommerce quote to a Shop draft
- The `CommerceOrder` created from that draft carries the `evidenceReference` back to the Ecommerce source

**What is missing**:
- No direct timestamp link from a Website lead to an Ecommerce request — the lead captures contact details but the Ecommerce flow does not record which lead triggered it
- Without managed persistence, leads and Ecommerce activity live in separate localStorage keys with no join key

**Reporting output** (aspirational for managed mode):
```
Website → Ecommerce → Shop conversion (week of 2026-08-11):
  Leads captured:        12
  Quotes from leads:      7  (58% visit-to-quote)
  Quotes confirmed:       5  (71% quote-to-order)
  Orders fulfilled:       3  (60% order-to-close)
```

**Implementation gate**: Requires managed persistence (Phase 2) to link lead → quote with a shared identifier. In local mode, the three products cannot be joined without a shared session ID. Design deferred to Phase 2; local mode can only show each step in isolation.

---

### Use case 4 — Plant output → Shop inventory reconciliation

**Who uses it**: Shop inventory manager verifying that Plant receipts match the expected batch.
**Question**: "Plant says JOB-044 closed with 38 good units. Has Shop received them?"

**What already exists**:
- `CommerceStockMovement` with `kind: 'production_receipt'` carries `productionJobId` and `productionOutputBatchId`
- Plant job `closure` records `closedAt`, `closedBy`, and `remainingUnits`

**Reporting output** (read-only):
```
Plant job:   JOB-044  Closed: 2026-08-13 16:00  By: Plant Supervisor
Output:      38 good  (target 40, closed 2 short)
Receipts:    Shop received 38 units via movement SM-0099 (2026-08-13 16:15)
Gap:         0 units unaccounted
```

**Implementation**: `projectJobFulfillmentReconciliation(commerceState, productionState)` — for each closed `ProductionJob`, find `CommerceStockMovement` records with matching `productionJobId` and `kind: 'production_receipt'`. Sum quantities; flag gaps. Pure projection from existing state.

---

## Implementation approach

### Phase A — Local read-only projections (no managed mode required)

These can be built now and shipped as read-only views within the existing browser-local products:

1. **`shop-production-status.ts`** — `projectShopOrderProductionStatus()` (Use case 1)
   - Input: `CommerceState`, `ProductionState`
   - Output: `ShopOrderProductionStatus[]` — one entry per order with a linked Plant job
   - Render location: Shop order detail or a new "Plant status" tab in the Shop workspace

2. **`shop-production-reconciliation.ts`** — `projectMaterialReconciliation()` and `projectJobFulfillmentReconciliation()` (Use cases 2 and 4)
   - Input: `CommerceState`, `ProductionState`
   - Output: reconciled material and receipt records
   - Render location: Plant materials panel or Shop inventory detail

3. **`cross-product-report.ts`** — Aggregate projection combining all three signals into one operating summary
   - Input: all four product states
   - Output: `CrossProductOperatingSummary` — top-level metrics only, no raw records
   - Render location: CEO brief (`/work/?view=ceo-brief`) or a new `/work/?view=cross-product` view

### Phase B — Ecommerce conversion path (managed mode required)

4. Add a `sourceLeadRef?: string` optional field to `EcommerceShopDraft` — set when the Ecommerce flow is entered from a Website lead link (URL parameter or session handoff)
5. Persist the lead-to-quote link in managed storage alongside both records
6. Build the conversion funnel projection from managed records

### Design constraints

- All Phase A projections are **pure functions**: `(stateA, stateB) => report`. No localStorage writes, no side effects.
- All projections are **deterministic**: given the same inputs, the same report. Idempotent; safe to recompute on every render.
- All projections are **read-only boundary reads**: they read from two product states but write to neither. The operating model — one owner per product workspace — is not changed.
- The `writePolicy: 'human_review_required'` on `ShopProductionDemandSignal.operatingContext` is respected: projections never create jobs, orders, or movements. They only surface what already happened.
- **No managed persistence required for Phase A**: all three source states (`CommerceState`, `ProductionState`, website leads) are already in localStorage under registered keys. The projection runs locally.

---

## Bundle cost estimate

| Component | Estimated bytes | Chunk |
|-----------|----------------|-------|
| `shop-production-status.ts` | ~800 bytes | `operating-models` |
| `shop-production-reconciliation.ts` | ~600 bytes | `operating-models` |
| `cross-product-report.ts` | ~500 bytes | `operating-models` |
| UI render (new view gate in WorkspaceControlsPage) | ~400 bytes | `core-app` |
| **Total estimate** | **~2,300 bytes** | within 3,041 headroom |

All projections live in the `operating-models` chunk alongside `shop-production-demand.ts` and `production-material-handoff.ts`. No new chunk needed.

---

## Adoption conditions

Phase A ships when:

- [x] `shop-production-status.ts` projection function passes a focused test (≥ 15 checks) — 41 checks (OPS-172)
- [x] `shop-production-reconciliation.ts` projection passes a focused test (≥ 15 checks) — 36 checks (OPS-173)
- [x] `cross-product-report.ts` passes a focused test (≥ 10 checks) — 28 checks (OPS-174)
- [ ] Render surface is gated by an existing view parameter (no new route) — OPS-175
- [ ] Bundle total remains ≤ 2,825,000 bytes — currently 2,821,959 (headroom 3,041 bytes; projection files not yet bundled)

Phase B ships when:

- [ ] Managed persistence is proven (shop-pilot-evidence checkpoint passes)
- [ ] `sourceLeadRef` field approved by founder before shipping to managed users (PII boundary: leads carry contact details)

---

## Open decisions (founder)

| Decision | Default if not decided |
|----------|----------------------|
| Which cross-product view should operators see first — Shop-centric (order status) or Plant-centric (job fulfillment)? | Shop-centric (order status) — closer to revenue |
| Should the cross-product report surface be at `/work/?view=cross-product` or embedded in the CEO brief? | Separate view (CEO brief already has a defined role) |
| Phase B: approve `sourceLeadRef` addition to `EcommerceShopDraft` before it ships to managed users? | Not shipped until approved |
