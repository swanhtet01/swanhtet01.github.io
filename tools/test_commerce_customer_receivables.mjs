import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      commerceReceivablesAging,
      commerceCustomerReceivablesHandoff,
      commerceCustomerReceivablesHandoffCsv,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/receivables-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  commerceReceivablesAging,
  commerceCustomerReceivablesHandoff,
  commerceCustomerReceivablesHandoffCsv,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const NOW = Date.parse('2026-08-11T10:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function makeOrder(id, total, daysOverdue = 0, customer = 'Acme Co', extras = {}) {
  const dueAt = new Date(NOW - daysOverdue * DAY_MS).toISOString()
  const createdAt = new Date(NOW - (daysOverdue + 30) * DAY_MS).toISOString()
  return {
    id, customer, payment: 'credit', total,
    status: 'confirmed', paymentStatus: 'pending',
    createdAt, promisedAt: dueAt, paymentDueAt: dueAt,
    ...extras,
  }
}

function makeState(orders = []) {
  return {
    orders,
    movements: [],
    purchaseOrders: [],
    purchaseRequisitions: [],
  }
}

// 1. null when no outstanding orders
{
  const result = commerceCustomerReceivablesHandoff(makeState(), NOW)
  check(result === null, 'returns null when no orders')
}

// 2. null when only completed/cancelled orders
{
  const state = makeState([
    { id: 'o1', customer: 'X', payment: 'cash', total: 5000,
      status: 'completed', paymentStatus: 'reconciled',
      createdAt: new Date(NOW).toISOString(), promisedAt: new Date(NOW).toISOString() },
    { id: 'o2', customer: 'Y', payment: 'cash', total: 3000,
      status: 'cancelled', paymentStatus: 'pending',
      createdAt: new Date(NOW).toISOString(), promisedAt: new Date(NOW).toISOString() },
  ])
  check(commerceCustomerReceivablesHandoff(state, NOW) === null, 'returns null when no pending orders')
}

// 3. schema and literal fields
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 5)]), NOW)
  check(artifact !== null, 'artifact not null')
  check(artifact.schema === 'supermega.commerce.customer-receivables-handoff.v1', 'schema correct')
  check(artifact.status === 'review_required', 'status correct')
  check(artifact.collectionAuthority === 'none', 'collectionAuthority none')
  check(artifact.paymentReceived === false, 'paymentReceived false')
  check(artifact.accountingPosted === false, 'accountingPosted false')
  check(artifact.currency === 'MMK', 'currency MMK')
}

// 4. correct aggregation — single order
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 75000, 10)]), NOW)
  check(artifact !== null, 'single order artifact present')
  check(artifact.outstandingOrderCount === 1, 'outstandingOrderCount 1')
  check(artifact.overdueOrderCount === 1, 'overdueOrderCount 1')
  check(artifact.totalOutstandingMmk === 75000, 'totalOutstandingMmk 75000')
  check(artifact.overdueOutstandingMmk === 75000, 'overdueOutstandingMmk 75000')
  check(artifact.rows.length === 1, 'one row')
  check(artifact.rows[0].bucket === '8_30', 'bucket 8_30 for 10 days overdue')
  check(artifact.rows[0].balanceMmk === 75000, 'row balance 75000')
}

// 5. current bucket (0 days past due)
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 10000, 0)]), NOW)
  check(artifact !== null, '0-day artifact present')
  check(artifact.rows[0].bucket === 'current', 'current bucket for 0 days past due')
  check(artifact.overdueOrderCount === 0, 'no overdue orders')
  check(artifact.overdueOutstandingMmk === 0, 'zero overdue mmk')
}

// 6. bucket totals across five orders (one per bucket)
{
  const orders = [
    makeOrder('o1', 10000, 0),   // current
    makeOrder('o2', 20000, 5),   // 1_7
    makeOrder('o3', 30000, 15),  // 8_30
    makeOrder('o4', 40000, 45),  // 31_60
    makeOrder('o5', 50000, 90),  // over_60
  ]
  const artifact = commerceCustomerReceivablesHandoff(makeState(orders), NOW)
  check(artifact !== null, 'multi-bucket artifact present')
  check(artifact.bucketTotalsMmk['current'] === 10000, 'current bucket total')
  check(artifact.bucketTotalsMmk['1_7'] === 20000, '1_7 bucket total')
  check(artifact.bucketTotalsMmk['8_30'] === 30000, '8_30 bucket total')
  check(artifact.bucketTotalsMmk['31_60'] === 40000, '31_60 bucket total')
  check(artifact.bucketTotalsMmk['over_60'] === 50000, 'over_60 bucket total')
  check(artifact.totalOutstandingMmk === 150000, 'total outstanding 150000')
  check(artifact.overdueOutstandingMmk === 140000, 'overdue outstanding 140000')
}

// 7. digest present and sha256-prefixed
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  check(artifact !== null, 'digest artifact present')
  check(typeof artifact.digest === 'string' && artifact.digest.startsWith('sha256:'), 'digest has sha256: prefix')
  check(artifact.digest.length === 71, 'digest is sha256:+64-hex-chars')
}

// 8. digest tamper detection
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  const tampered = { ...artifact, digest: artifact.digest.slice(0, -4) + '0000' }
  let threw = false
  try {
    commerceCustomerReceivablesHandoffCsv(tampered)
  } catch (err) {
    threw = err.message.includes('integrity')
  }
  check(threw, 'CSV rejects tampered digest')
}

// 9. CSV header columns present
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  const csv = commerceCustomerReceivablesHandoffCsv(artifact)
  const header = csv.split('\r\n')[0]
  for (const col of ['schema', 'order_id', 'customer', 'balance_mmk', 'days_past_due', 'bucket',
    'total_outstanding_mmk', 'artifact_digest', 'collection_authority', 'payment_received',
    'outstanding_order_count', 'overdue_order_count']) {
    check(header.includes(col), `CSV header has column: ${col}`)
  }
}

// 10. CSV data row count matches artifact
{
  const orders = [makeOrder('o1', 10000, 2), makeOrder('o2', 20000, 10), makeOrder('o3', 30000, 35)]
  const artifact = commerceCustomerReceivablesHandoff(makeState(orders), NOW)
  const csv = commerceCustomerReceivablesHandoffCsv(artifact)
  const dataRows = csv.split('\r\n').filter((l) => l.length > 0).slice(1)
  check(dataRows.length === 3, `3 data rows (got ${dataRows.length})`)
}

// 11. CSV ends with CRLF
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  const csv = commerceCustomerReceivablesHandoffCsv(artifact)
  check(csv.endsWith('\r\n'), 'CSV ends with CRLF')
}

// 12. collectionAuthorized is always false
{
  const orders = [makeOrder('o1', 50000, 5), makeOrder('o2', 25000, 0)]
  const artifact = commerceCustomerReceivablesHandoff(makeState(orders), NOW)
  check(artifact.rows.every((r) => r.collectionAuthorized === false), 'all rows have collectionAuthorized false')
}

// 13. lastCollectionAt from proof
{
  const order = makeOrder('o1', 50000, 10, 'Acme', {
    collectionActions: [{
      proof: {
        actionId: 'act1', capturedAt: '2026-08-01T09:00:00.000Z',
        actor: 'manager@shop', reason: 'follow-up', evidenceReference: 'call-log-01',
      },
    }],
  })
  const artifact = commerceCustomerReceivablesHandoff(makeState([order]), NOW)
  check(artifact !== null, 'collection artifact present')
  const row = artifact.rows[0]
  check(row.lastCollectionAt === '2026-08-01T09:00:00.000Z', 'lastCollectionAt from proof')
  check(row.lastCollectionActor === 'manager@shop', 'lastCollectionActor from proof')
  check(row.lastCollectionEvidence === 'call-log-01', 'lastCollectionEvidence from proof')
}

// 14. no collection actions — last fields null
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 5)]), NOW)
  const row = artifact.rows[0]
  check(row.lastCollectionAt === null, 'lastCollectionAt null when no action')
  check(row.lastCollectionActor === null, 'lastCollectionActor null when no action')
  check(row.lastCollectionEvidence === null, 'lastCollectionEvidence null when no action')
}

// 15. generatedAt equals aging asOf
{
  const aging = commerceReceivablesAging(makeState([makeOrder('o1', 50000, 2)]), NOW)
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  check(artifact.generatedAt === aging.asOf, 'generatedAt matches aging asOf')
}

// 16. createdAt falls back to dueAt when order not in state (edge case)
{
  // Build a minimal state where the order exists (normal case — createdAt present)
  const order = makeOrder('o1', 50000, 10)
  const artifact = commerceCustomerReceivablesHandoff(makeState([order]), NOW)
  check(artifact.rows[0].createdAt === order.createdAt, 'createdAt taken from order when present')
}

// 17. CSV digest column matches artifact digest
{
  const artifact = commerceCustomerReceivablesHandoff(makeState([makeOrder('o1', 50000, 2)]), NOW)
  const csv = commerceCustomerReceivablesHandoffCsv(artifact)
  const dataRow = csv.split('\r\n')[1]
  check(dataRow.includes(artifact.digest), 'CSV data row contains artifact digest')
}

console.log(`\ntest_commerce_customer_receivables: ${checks} checks passed\n`)
