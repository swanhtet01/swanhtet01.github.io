// Supplier credit note actor brief: recording.actor distribution across all credit notes on supplier return claims.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierCreditNoteActorBrief } from './shop-supplier-credit-note-actor-brief.ts'`,
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

const { projectShopSupplierCreditNoteActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function proof(actor) {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Recorded.', evidenceReference: 'EVD-1' }
}

let noteId = 0
function note(recordingActor) {
  noteId++
  return {
    id: `CN-${noteId}`,
    supplierReference: `SUP-REF-${noteId}`,
    issuedAt: '2026-08-01T09:00:00Z',
    amountMmk: 50000,
    accountingPosted: false,
    recording: proof(recordingActor),
  }
}

let claimId = 0
function claim(creditNotes) {
  claimId++
  return {
    id: `CLM-${claimId}`,
    createdAt: '2026-08-01T09:00:00Z',
    receiptMovementId: `MOV-${claimId}`,
    quantityRejected: 5,
    reasonCode: 'damaged',
    claimAmountMmk: 50000,
    internalReturnReference: `RET-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: proof('auth-1'),
    creditNotes,
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

// 1. No purchase orders → all zeros
{
  const r = projectShopSupplierCreditNoteActorBrief(state(undefined))
  check(r.totalCreditNotes === 0, 'empty: totalCreditNotes 0')
  check(r.uniqueRecordingActors === 0, 'empty: uniqueRecordingActors 0')
  check(r.topRecordingActorsByCount.length === 0, 'empty: topRecordingActorsByCount empty')
}

// 2. PO with no returns → all zeros
{
  const r = projectShopSupplierCreditNoteActorBrief(state([po([])]))
  check(r.totalCreditNotes === 0, 'no-returns: totalCreditNotes 0')
}

// 3. Claim with no credit notes → all zeros
{
  const r = projectShopSupplierCreditNoteActorBrief(state([po([claim([])])]))
  check(r.totalCreditNotes === 0, 'no-notes: totalCreditNotes 0')
}

// 4. Single credit note → all fields populated
{
  const r = projectShopSupplierCreditNoteActorBrief(
    state([po([claim([note('accountant-1')])])]),
  )
  check(r.totalCreditNotes === 1, 'single: totalCreditNotes 1')
  check(r.uniqueRecordingActors === 1, 'single: uniqueRecordingActors 1')
  check(r.topRecordingActorsByCount[0]?.actor === 'accountant-1', 'single: top actor accountant-1')
  check(r.topRecordingActorsByCount[0]?.count === 1, 'single: count 1')
}

// 5. Multiple notes across multiple claims/POs → actor accumulation
{
  const r = projectShopSupplierCreditNoteActorBrief(
    state([
      po([claim([note('accountant-1'), note('accountant-1')])]),
      po([claim([note('accountant-2')])]),
    ]),
  )
  check(r.totalCreditNotes === 3, 'multi: totalCreditNotes 3')
  check(r.uniqueRecordingActors === 2, 'multi: uniqueRecordingActors 2')
  check(r.topRecordingActorsByCount[0]?.actor === 'accountant-1', 'multi: top accountant-1')
  check(r.topRecordingActorsByCount[0]?.count === 2, 'multi: top count 2')
}

// 6. Top-5 cap + tiebreak
{
  const actors = ['Z-acc', 'A-acc', 'C-acc', 'B-acc', 'D-acc', 'E-acc']
  const r = projectShopSupplierCreditNoteActorBrief(
    state([po([claim(actors.map(a => note(a)))])]),
  )
  check(r.topRecordingActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topRecordingActorsByCount[0]?.actor === 'A-acc', 'top5: tiebreak A-acc first')
}

console.log(JSON.stringify({ ok: true, checks }))
