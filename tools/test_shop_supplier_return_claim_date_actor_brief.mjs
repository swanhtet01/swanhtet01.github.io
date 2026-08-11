// Supplier return claim date/actor brief: createdAt date range + authorization.actor distribution across all PO supplier return claims.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierReturnClaimDateActorBrief } from './shop-supplier-return-claim-date-actor-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopSupplierReturnClaimDateActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const DIGEST = 'sha256:' + 'a'.repeat(64)

function proof(actor) {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Authorized.', evidenceReference: 'EVD-1' }
}

let claimId = 0
function claim(createdAt, authActor) {
  claimId++
  return {
    id: `CLM-${claimId}`,
    createdAt,
    receiptMovementId: `MOV-${claimId}`,
    quantityRejected: 5,
    reasonCode: 'damaged',
    claimAmountMmk: 50000,
    internalReturnReference: `RET-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: proof(authActor),
    creditNotes: [],
  }
}

let poId = 0
function po(supplierReturns) {
  poId++
  return {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T09:00:00Z',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    creation: proof('mgr-1'),
    supplierReturns,
  }
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopSupplierReturnClaimDateActorBrief(state(undefined))
  check(r.totalClaims === 0, 'empty: totalClaims 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.uniqueAuthorizationActors === 0, 'empty: uniqueAuthorizationActors 0')
  check(r.topAuthorizationActorsByCount.length === 0, 'empty: topAuthorizationActorsByCount empty')
}

// 2. PO with no supplier returns → all zeros
{
  const r = projectShopSupplierReturnClaimDateActorBrief(state([po([])]))
  check(r.totalClaims === 0, 'no-returns: totalClaims 0')
}

// 3. Single claim → all fields populated
{
  const r = projectShopSupplierReturnClaimDateActorBrief(
    state([po([claim('2026-08-05T09:00:00Z', 'auth-1')])]),
  )
  check(r.totalClaims === 1, 'single: totalClaims 1')
  check(r.earliestCreatedAt === '2026-08-05T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T09:00:00Z', 'single: latestCreatedAt')
  check(r.uniqueAuthorizationActors === 1, 'single: uniqueAuthorizationActors 1')
  check(r.topAuthorizationActorsByCount[0]?.actor === 'auth-1', 'single: top actor auth-1')
}

// 4. Date ordering across multiple POs
{
  const r = projectShopSupplierReturnClaimDateActorBrief(
    state([
      po([claim('2026-08-10T09:00:00Z', 'auth-1')]),
      po([claim('2026-08-01T09:00:00Z', 'auth-1'), claim('2026-08-05T09:00:00Z', 'auth-1')]),
    ]),
  )
  check(r.totalClaims === 3, 'dates: totalClaims 3')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'dates: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T09:00:00Z', 'dates: latestCreatedAt')
}

// 5. Multiple actors → distribution
{
  const r = projectShopSupplierReturnClaimDateActorBrief(
    state([
      po([claim('2026-08-01T09:00:00Z', 'auth-1'), claim('2026-08-02T09:00:00Z', 'auth-1')]),
      po([claim('2026-08-03T09:00:00Z', 'auth-2')]),
    ]),
  )
  check(r.uniqueAuthorizationActors === 2, 'multi-actor: uniqueAuthorizationActors 2')
  check(r.topAuthorizationActorsByCount[0]?.actor === 'auth-1', 'multi-actor: top auth-1')
  check(r.topAuthorizationActorsByCount[0]?.count === 2, 'multi-actor: count 2')
}

// 6. Top-5 cap + tiebreak
{
  const actors = ['Z-auth', 'A-auth', 'C-auth', 'B-auth', 'D-auth', 'E-auth']
  const r = projectShopSupplierReturnClaimDateActorBrief(
    state([po(actors.map(a => claim('2026-08-01T09:00:00Z', a)))]),
  )
  check(r.topAuthorizationActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topAuthorizationActorsByCount[0]?.actor === 'A-auth', 'top5: tiebreak A-auth first')
}

console.log(JSON.stringify({ ok: true, checks }))
