// Shop order support service event owner brief: owner distribution across service events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportServiceEventOwnerBrief } from './shop-order-support-service-event-owner-brief.ts'`,
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

const { projectShopOrderSupportServiceEventOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', actorId: 'user-1', timestamp: '2026-08-12T09:00:00Z' }

let orderId = 0
let caseId = 0

function serviceEvent(owner) {
  return {
    kind: 'reassigned',
    owner,
    priority: 'medium',
    dueAt: '2026-08-15T00:00:00Z',
    note: 'Handling.',
    proof: PROOF,
  }
}

function supportCase({ serviceEvents, followUpServiceEvents } = {}) {
  caseId++
  const base = {
    id: `CASE-${caseId}`,
    openedAt: '2026-08-01T09:00:00Z',
    customerDescription: 'Issue.',
    status: 'open',
    priority: 'medium',
    category: 'billing',
    opening: PROOF,
  }
  if (serviceEvents !== undefined) base.serviceEvents = serviceEvents
  if (followUpServiceEvents !== undefined) base.followUpServiceEvents = followUpServiceEvents
  return base
}

function order(supportCases = []) {
  orderId++
  return {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-01T00:00:00Z',
    customer: 'cust-1',
    channel: 'counter',
    item: 'item-1',
    quantity: 1,
    payment: 'cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    total: 1000,
    status: 'confirmed',
    supportCases,
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty orders → all zeros
{
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([]))
  check(r.totalServiceEvents === 0, 'empty: totalServiceEvents 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.topOwnersByCount.length === 0, 'empty: topOwnersByCount empty')
}

// 2. Case with no service events
{
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([order([supportCase()])]))
  check(r.totalServiceEvents === 0, 'no-events: totalServiceEvents 0')
  check(r.uniqueOwners === 0, 'no-events: uniqueOwners 0')
}

// 3. Single service event
{
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([
    order([supportCase({ serviceEvents: [serviceEvent('Alice')] })]),
  ]))
  check(r.totalServiceEvents === 1, 'single: totalServiceEvents 1')
  check(r.uniqueOwners === 1, 'single: uniqueOwners 1')
  check(r.topOwnersByCount[0]?.owner === 'Alice', 'single: top owner Alice')
}

// 4. Follow-up service events also counted
{
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([
    order([supportCase({
      serviceEvents: [serviceEvent('Alice')],
      followUpServiceEvents: [serviceEvent('Bob')],
    })]),
  ]))
  check(r.totalServiceEvents === 2, 'followup: totalServiceEvents 2')
  check(r.uniqueOwners === 2, 'followup: uniqueOwners 2')
}

// 5. Same owner across multiple events → count accumulates
{
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([
    order([
      supportCase({ serviceEvents: [serviceEvent('Carol'), serviceEvent('Carol')] }),
    ]),
  ]))
  check(r.totalServiceEvents === 2, 'same-owner: totalServiceEvents 2')
  check(r.uniqueOwners === 1, 'same-owner: uniqueOwners 1')
  check(r.topOwnersByCount[0]?.count === 2, 'same-owner: top owner count 2')
}

// 6. Top-5 cap: 6 distinct owners → capped at 5 with tiebreak
{
  const owners = ['Frank', 'Alice', 'Carol', 'Bob', 'Dave', 'Eve']
  const r = projectShopOrderSupportServiceEventOwnerBrief(state([
    order([supportCase({ serviceEvents: owners.map(o => serviceEvent(o)) })]),
  ]))
  check(r.uniqueOwners === 6, 'top5: uniqueOwners 6')
  check(r.topOwnersByCount.length === 5, 'top5: capped at 5')
  check(r.topOwnersByCount[0]?.owner === 'Alice', 'top5: tiebreak alphabetic Alice first')
}

console.log(JSON.stringify({ ok: true, checks }))
