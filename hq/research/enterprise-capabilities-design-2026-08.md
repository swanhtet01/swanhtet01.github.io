# SuperMega Enterprise Capabilities Design

Date: 2026-08-11
Author: CEO / Codex integrator
Status: design-ready; implementation gates listed per capability
Sequence: verified-statements → staff-roles → shared-workspace

---

## Overview

Three enterprise capability tiers unlock in strict sequence. Each requires the prior one to be proven in production. None can be bypassed.

| Tier | ID | Prerequisites | What it enables |
|------|----|--------------|-----------------|
| 1 | `verified-statements` | managed-storage-proof, shop-pilot-evidence | Owner-signed timestamps on accounting handoffs; downstream trust |
| 2 | `staff-roles` | verified-statements, one named operator | Delegated write authority within a managed tenant |
| 3 | `shared-workspace` | staff-roles, OEE pilot evidence | Multiple staff see the same live state; no data authority conflict |

---

## Tier 1: verified-statements

### What problem this solves

Today, every accounting handoff artifact (daily close CSV, supplier payables CSV, AR customer receivables CSV) carries a SHA-256 digest and explicit `accountingPosted: false` / `paymentAuthority: none` controls. The artifact is tamper-evident but there is no record that the founder actually looked at it before handing it to the accountant.

An accountant receiving a CSV does not know whether:
- The founder reviewed it (or just downloaded it)
- It represents a complete accounting period (or a mid-period snapshot)
- It is the final version or a draft

The `verified-statements` capability adds an owner-signed review timestamp to each handoff artifact that the accountant can independently verify.

### Design

**Artifact extension**: Each handoff artifact gains an optional `ownerVerification` field:

```typescript
type OwnerVerification = {
  schema: 'supermega.owner-verification.v1'
  artifactDigest: string       // the exact digest being verified
  verifiedAt: string           // ISO timestamp
  verifiedBy: string           // authenticated actor identity
  reviewEvidence: string       // e.g. "reviewed line items 1-47, balance matches close-2026-08-11"
  verificationDigest: string   // sha256 of [artifactDigest, verifiedAt, verifiedBy, reviewEvidence]
}
```

**Review surface**: A "Verify for accountant" action appears inside the accounting export packet (collapsed Business controls) after the owner reviews the artifact in the browser. The action:
1. Displays the artifact digest prominently
2. Requires a short review note (minimum 20 characters)
3. Stamps the authenticated actor and monotonic managed time
4. Appends the `ownerVerification` to the artifact record
5. Makes the "Download verified copy" link available (includes the ownerVerification field in the exported JSON/CSV)

**Accountant verification**: The accountant receives the verified artifact. The CSV gains three trailer rows at the end:
```
verified_artifact_digest,sha256:abc...
verified_at,2026-08-11T14:30:00.000Z
verified_by,swan@supermega.dev
verification_digest,sha256:xyz...
```
The accountant (or their system) can recompute `sha256([artifactDigest, verifiedAt, verifiedBy, reviewEvidence])` and confirm it matches `verificationDigest`. No external call required.

**Capability gate**: `VERIFIED_OPERATOR` tier. Unlocks only after:
1. `managed-storage-proof` passes (isolated tenant, RLS, durable store)
2. `shop-pilot-evidence` passes (one completed order-to-close on managed tenant)
3. One managed accounting export verified by the founder on the live tenant

**What this does NOT do**:
- Does not post to any accounting system
- Does not constitute a financial audit
- Does not replace the accountant's independent judgment
- Does not prevent the owner from issuing a revised artifact (but revised artifacts have a different digest and the old verification still references the old digest)

---

## Tier 2: staff-roles

### What problem this solves

Currently, every consequential write requires "founder" authority. This is correct for an isolated demo with one operator. It becomes a bottleneck when a business has:
- A cashier who should be able to create counter sales but not cancel orders
- A supervisor who should be able to approve CAPA but not modify tax codes
- A stock manager who should be able to receive purchase orders but not override daily close
- A plant operator who should be able to record output but not release held stock

Staff roles allow the founder to delegate specific write authorities to named authenticated staff members.

### Role taxonomy

| Role | Core authorities | Cannot do |
|------|-----------------|-----------|
| `cashier` | Counter sales, payment confirmation | Order cancellation, refund, daily close, catalog changes |
| `fulfiller` | Pick, pack, ship confirmation, carrier update | Payment changes, returns acceptance, credit notes |
| `stock-manager` | Purchase order receipt, location transfer, reorder | Price changes, supplier negotiation, customer credit |
| `shop-supervisor` | All cashier + fulfiller + stock-manager + order amendment, cancellation, return acceptance | Tax revision, accounting export, staff management |
| `plant-operator` | Job output, material consumption, issue opening, CAPA | Job closure, batch release, OEE calculation |
| `plant-supervisor` | All plant-operator + CAPA approval, quality release, maintenance sign-off | Equipment commissioning, calibration revision |
| `quality-inspector` | Quality issue opening, hold placement, CAPA review, sample inspection | Job output, material issue, batch release |
| `accountant-liaison` | Read accounting export, download verified statements | No write authority at all |
| `admin` | All write authorities except staff management and tax/accounting configuration | Cannot add/remove other admin roles |
| `owner` | All authorities | N/A |

### Implementation model

**Role assignment**: Owner assigns named authenticated roles per tenant. Each assignment has:
- `roleId` (from the taxonomy)
- `assignedTo` (authenticated user identity)
- `assignedAt` (managed timestamp)
- `assignedBy` (must be owner or admin)
- `effectiveTo` (optional expiry date)
- `evidenceReference` (why this person was given this role)

**Write authority check**: Every write operation (currently: returns founder-gated) gains a `requiresRole` annotation in the capability tier:

```typescript
type RequiredAuthority = {
  minimumRole: StaffRole
  ownerCanOverride: true  // always true; owner is never blocked
  requiresManagerApproval?: boolean  // for high-consequence writes
}
```

**Audit trail**: Every role-gated write records the actor's role at the time of write. If the role is revoked later, the write history is unchanged (it was authorized at the time). The audit trail is immutable.

**Off-boarding**: Revoking a role does not cancel or undo any prior writes made under that role. It prevents future writes only.

### Implementation gates

1. `managed-storage-proof` + `verified-statements` (in that order)
2. One named staff member enrolled in a protected preview tenant
3. The role assignment write is itself owner-gated (owner cannot be locked out)
4. Role boundary tests pass: cashier cannot cancel; supervisor can; admin can; owner can

### What this does NOT do

- Does not implement org chart or reporting lines
- Does not implement two-person approval (that is a separate enterprise gate)
- Does not grant cross-tenant write authority
- Does not replicate roles between tenants (each tenant has its own role assignments)

---

## Tier 3: shared-workspace

### What problem this solves

In the current model, one operator at a time uses one browser session with local state. Two operators at the same business cannot see the same state without screen-sharing. A supervisor cannot see what the cashier is doing in real-time.

Shared workspace allows multiple authenticated staff members to see the same managed state simultaneously. Each staff member sees:
- The same order queue (Shop)
- The same open jobs and quality issues (Plant)
- The same current stock levels
- Their own pending actions (filtered by their role)

### Architecture

**State ownership**: The managed tenant's Supabase tables are the single source of truth. Each browser session reads from managed state rather than local browser storage. Writes go through the same durable command pipeline as before.

**Refresh model**: Supabase Realtime broadcast is available but deferred (see `realtime-broadcast` research gate: `defer` until simultaneous operators create a measured refresh problem). The initial shared-workspace implementation uses polling:
- Active session polls every 30 seconds
- User action triggers an immediate refresh
- No live push until the `realtime-broadcast` gate reopens

**Conflict model**: Each write carries an optimistic version number. If two operators modify the same order simultaneously, the second write is rejected and the operator sees a conflict resolution prompt. The prompt shows the current state and the proposed change. The operator can:
- Accept the current state (discard their change)
- Override with their change (if their role permits)
- Escalate to a supervisor

**Session boundary**: A staff member's session is scoped to their tenant and role. They cannot see orders or records from other tenants. They cannot see data they do not have role permission to read.

### Role-filtered views

Each role sees a filtered view of shared state:
- **Cashier**: today's orders, counter queue, payment status (no stock cost, no P&L)
- **Fulfiller**: pick queue, fulfilment status, open orders needing action (no payment amounts)
- **Stock-manager**: stock levels, purchase order status, reorder queue (no customer contact)
- **Plant-operator**: open jobs, output queue, quality issues assigned to them
- **Supervisor**: everything below their role level

### Implementation gates

1. `staff-roles` proven and passing in production for at least 5 days
2. At least two named staff members enrolled on the same managed tenant
3. Conflict resolution tested: two simultaneous counter sales, one rejected, one resolved
4. The polling model passes: no stale data visible after 30 seconds of changes by another operator
5. Privacy audit: no staff member can see another tenant's data; no role can see data above their permission tier

---

## Sequencing rationale

**Why verified-statements first?** An accountant receiving an unverified CSV has no way to know if the founder saw it. Before any staff have write authority, the owner needs a mechanism to formally attest to what they're handing off. Verified statements solve the paper trail problem before the team grows.

**Why staff-roles before shared-workspace?** Without role-based write authority, shared workspace would let any authenticated user write anything. The role system defines who can write what. Shared workspace then makes that role-filtered state visible to the right people at the right time.

**Why not implement in parallel?** Each tier requires the prior one to be proven in production, not just designed or tested locally. The proof is: one real operator using the prior tier for a real workflow and no data integrity incident in the evidence window.

---

## Implementation priority within each tier

### verified-statements implementation order

1. `supermega.owner-verification.v1` schema and TypeScript types (local, no bundle impact)
2. `sha256(artifactDigest + verifiedAt + verifiedBy + reviewEvidence)` verification function
3. Test: verification digest matches recompute; tampered fields fail; schema check
4. UI: "Verify for accountant" action inside accounting export packet (after pilot activation)
5. CSV trailer rows in `commerceDailyCloseHandoffCsv`, `commerceSupplierPayablesHandoffCsv`, `commerceCustomerReceivablesHandoffCsv`
6. Managed-mode write: store verification event in `accounting_verifications` table

### staff-roles implementation order

1. Role taxonomy types and validation (local, no bundle impact)
2. Role assignment write path (managed only, after tenant proof)
3. Role boundary test suite: all 8 roles, all 5 key write operations, valid/invalid matrix (no bundle impact)
4. UI: role indicator visible to each authenticated staff member
5. Capability tier integration: each write operation annotated with `requiresRole`
6. Audit trail viewer (read-only, filtered by role)

### shared-workspace implementation order

1. Read-only managed state projection (polling, no optimistic writes)
2. Today queue for each role (filtered view of Shop + Plant state)
3. Write with optimistic version check
4. Conflict resolution UI (simple: reject with prompt, no merge)
5. Realtime upgrade (deferred until measured need)

---

## Artifact budget impact

| Capability | Estimated local-only bytes (TypeScript types + pure functions) | Estimated managed-mode bytes (full UI) |
|------------|--------------------------------------------------------------|----------------------------------------|
| verified-statements | ~400 bytes | ~2,000 bytes |
| staff-roles | ~600 bytes | ~3,500 bytes |
| shared-workspace | 0 bytes (managed-only) | ~5,000 bytes |

Current headroom: 7,437 bytes. All three local-only components fit within headroom. Full UI requires budget reduction elsewhere before each tier activates — implement types and pure functions first, defer UI rendering until budget is freed or expanded.

---

## Open questions (for founder)

1. Should staff-role assignments expire automatically (e.g., 90 days) and require renewal?
2. Should the accountant-liaison role be able to receive the verified CSV via email, or must they download it through the operator UI?
3. For shared-workspace conflict resolution, should supervisors always win, or should the policy be configurable?
4. Should one staff member be able to hold multiple roles (e.g., a supervisor who is also the quality inspector)?
