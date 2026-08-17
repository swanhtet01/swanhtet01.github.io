// Shop purchase requisition actor brief: approval.actor text distribution across purchase requisitions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionActorBrief } from './shop-purchase-requisition-actor-brief.ts'`,
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

const { projectShopPurchaseRequisitionActorBrief } = await import(
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
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Approved.', evidenceReference: 'EVD-1' }
}

let reqId = 0
function req(approvalActor) {
  reqId++
  return {
    id: `REQ-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityRequested: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    sourceDecisionDigest: DIGEST,
    sourceReplenishmentDigest: DIGEST,
    approval: proof(approvalActor),
  }
}

function state(purchaseRequisitions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseRequisitions !== undefined) base.purchaseRequisitions = purchaseRequisitions
  return base
}

// 1. No requisitions → all zeros
{
  const r = projectShopPurchaseRequisitionActorBrief(state(undefined))
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.uniqueApprovalActors === 0, 'empty: uniqueApprovalActors 0')
  check(r.topApprovalActorsByCount.length === 0, 'empty: topApprovalActorsByCount empty')
}

// 2. Single requisition → actor captured
{
  const r = projectShopPurchaseRequisitionActorBrief(state([req('manager-1')]))
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.uniqueApprovalActors === 1, 'single: uniqueApprovalActors 1')
  check(r.topApprovalActorsByCount[0]?.actor === 'manager-1', 'single: top actor manager-1')
  check(r.topApprovalActorsByCount[0]?.count === 1, 'single: count 1')
}

// 3. Multiple requisitions, same actor → counted, uniqueApprovalActors=1
{
  const r = projectShopPurchaseRequisitionActorBrief(
    state([req('manager-1'), req('manager-1'), req('manager-1')]),
  )
  check(r.totalRequisitions === 3, 'same-actor: totalRequisitions 3')
  check(r.uniqueApprovalActors === 1, 'same-actor: uniqueApprovalActors 1')
  check(r.topApprovalActorsByCount[0]?.count === 3, 'same-actor: count 3')
}

// 4. Multiple actors → distribution
{
  const r = projectShopPurchaseRequisitionActorBrief(
    state([req('manager-1'), req('manager-1'), req('director-1')]),
  )
  check(r.uniqueApprovalActors === 2, 'multi-actor: uniqueApprovalActors 2')
  check(r.topApprovalActorsByCount[0]?.actor === 'manager-1', 'multi-actor: top manager-1')
  check(r.topApprovalActorsByCount[0]?.count === 2, 'multi-actor: count 2')
  check(r.topApprovalActorsByCount[1]?.actor === 'director-1', 'multi-actor: second director-1')
}

// 5. Top-5 cap
{
  const actors = ['Z-mgr', 'A-mgr', 'C-mgr', 'B-mgr', 'D-mgr', 'E-mgr']
  const r = projectShopPurchaseRequisitionActorBrief(state(actors.map(a => req(a))))
  check(r.topApprovalActorsByCount.length === 5, 'top5: capped at 5')
}

// 6. Alphabetical tiebreak
{
  const r = projectShopPurchaseRequisitionActorBrief(state([req('Z-manager'), req('A-manager')]))
  check(r.topApprovalActorsByCount[0]?.actor === 'A-manager', 'tiebreak: A-manager before Z-manager')
}

console.log(JSON.stringify({ ok: true, checks }))
