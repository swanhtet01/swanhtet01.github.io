// Shop supplier invoice due brief: dueAt date range + recording.actor distribution across invoiced purchase orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierInvoiceDueBrief } from './shop-supplier-invoice-due-brief.ts'`,
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

const { projectShopSupplierInvoiceDueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const DIGEST = 'sha256:' + 'a'.repeat(64)

function proof(actor = 'buyer-1') {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Verified.', evidenceReference: 'EVD-1' }
}

let poId = 0
function po(dueAt, recordingActor = 'buyer-1') {
  poId++
  return {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T08:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    approval: proof(),
    receiving: proof(),
    sourceRequisitionDigest: DIGEST,
    supplierInvoice: {
      id: `INV-${poId}`,
      supplierReference: `SREF-${poId}`,
      issuedAt: '2026-08-01',
      dueAt,
      quantityInvoiced: 10,
      unitCostMmk: 50000,
      totalMmk: 500000,
      recording: proof(recordingActor),
    },
  }
}

function poNoInvoice() {
  poId++
  return {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T08:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    approval: proof(),
    receiving: proof(),
    sourceRequisitionDigest: DIGEST,
  }
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopSupplierInvoiceDueBrief(state(undefined))
  check(r.totalInvoices === 0, 'empty: totalInvoices 0')
  check(r.earliestDueAt === null, 'empty: earliestDueAt null')
  check(r.latestDueAt === null, 'empty: latestDueAt null')
  check(r.uniqueRecordingActors === 0, 'empty: uniqueRecordingActors 0')
  check(r.topRecordingActorsByCount.length === 0, 'empty: topRecordingActorsByCount empty')
}

// 2. POs without invoices → skipped
{
  const r = projectShopSupplierInvoiceDueBrief(state([poNoInvoice(), poNoInvoice()]))
  check(r.totalInvoices === 0, 'no-inv: totalInvoices 0')
  check(r.uniqueRecordingActors === 0, 'no-inv: uniqueRecordingActors 0')
}

// 3. Single invoice → all fields populated
{
  const r = projectShopSupplierInvoiceDueBrief(state([po('2026-09-15', 'finance-1')]))
  check(r.totalInvoices === 1, 'single: totalInvoices 1')
  check(r.earliestDueAt === '2026-09-15', 'single: earliestDueAt')
  check(r.latestDueAt === '2026-09-15', 'single: latestDueAt')
  check(r.uniqueRecordingActors === 1, 'single: uniqueRecordingActors 1')
  check(r.topRecordingActorsByCount[0]?.actor === 'finance-1', 'single: top actor')
}

// 4. Date ordering across multiple invoices
{
  const r = projectShopSupplierInvoiceDueBrief(
    state([po('2026-10-01'), po('2026-08-15'), po('2026-09-30')]),
  )
  check(r.totalInvoices === 3, 'dates: totalInvoices 3')
  check(r.earliestDueAt === '2026-08-15', 'dates: earliestDueAt 2026-08-15')
  check(r.latestDueAt === '2026-10-01', 'dates: latestDueAt 2026-10-01')
}

// 5. Same actor repeated → single unique, count accumulated
{
  const r = projectShopSupplierInvoiceDueBrief(
    state([po('2026-09-01', 'ops-1'), po('2026-09-02', 'ops-1'), po('2026-09-03', 'ops-1')]),
  )
  check(r.uniqueRecordingActors === 1, 'same-actor: uniqueRecordingActors 1')
  check(r.topRecordingActorsByCount[0]?.count === 3, 'same-actor: count 3')
}

// 6. Multiple actors → count and distribution
{
  const r = projectShopSupplierInvoiceDueBrief(
    state([po('2026-09-01', 'ops-1'), po('2026-09-02', 'ops-1'), po('2026-09-03', 'fin-1')]),
  )
  check(r.uniqueRecordingActors === 2, 'multi-actor: uniqueRecordingActors 2')
  check(r.topRecordingActorsByCount[0]?.actor === 'ops-1', 'multi-actor: top actor ops-1')
}

// 7. Top-5 cap
{
  const actors = ['actor-F', 'actor-A', 'actor-C', 'actor-B', 'actor-D', 'actor-E']
  const r = projectShopSupplierInvoiceDueBrief(state(actors.map(a => po('2026-09-01', a))))
  check(r.topRecordingActorsByCount.length === 5, 'top5: capped at 5')
}

// 8. Alphabetical tiebreak
{
  const r = projectShopSupplierInvoiceDueBrief(
    state([po('2026-09-01', 'Z-actor'), po('2026-09-02', 'A-actor')]),
  )
  check(r.topRecordingActorsByCount[0]?.actor === 'A-actor', 'tiebreak: A-actor before Z-actor')
}

console.log(JSON.stringify({ ok: true, checks }))
