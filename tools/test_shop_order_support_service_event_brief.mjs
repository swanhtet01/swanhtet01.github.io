// Shop order support service event brief: CommerceSupportServiceEventKind distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportServiceEventBrief } from './shop-order-support-service-event-brief.ts'`,
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

const { projectShopOrderSupportServiceEventBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function serviceEvent(kind) {
  eventId++
  return {
    kind,
    owner: `staff-${eventId}`,
    priority: 'normal',
    dueAt: '2026-08-12T12:00:00Z',
    note: 'Service event note.',
    proof: { actionId: `act-ev-${eventId}`, capturedAt: '2026-08-11T11:00:00Z', actor: 'staff', reason: 'Event', evidenceReference: '' },
  }
}

let caseId = 0
function supportCase({ events = [], followUpEvents = [] } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription: 'Issue',
    status: 'open',
    opening: { actionId: `act-open-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', summary: 'Opened', evidence: [] },
    externalMessageSent: false,
    refundStarted: false,
    ...(events.length > 0 && { serviceEvents: events }),
    ...(followUpEvents.length > 0 && { followUpServiceEvents: followUpEvents }),
  }
}

let orderId = 0
function order(supportCases = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item',
    quantity: 1,
    unitPriceMmk: 5000,
    totalMmk: 5000,
    status: 'confirmed',
    supportCases,
  }
}

function state(orders) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: orders ?? [],
    movements: [],
    closes: [],
    catalogBaselines: [],
    catalogChanges: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseBudgetEnvelopes: [],
    supplierSourcingDecisions: [],
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderSupportServiceEventBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.casesWithServiceEvents === 0, 'empty: casesWithServiceEvents 0')
  check(r.totalServiceEvents === 0, 'empty: totalServiceEvents 0')
  check(r.byKind.reassigned === 0, 'empty: reassigned 0')
  check(r.byKind.escalated === 0, 'empty: escalated 0')
  check(r.byKind.acknowledged === 0, 'empty: acknowledged 0')
  check(r.byKind.firstResponseReady === 0, 'empty: firstResponseReady 0')
  check(r.escalatedCases === 0, 'empty: escalatedCases 0')
  check(r.followUpServiceEventCases === 0, 'empty: followUpServiceEventCases 0')
}

// 2. Case with no service events
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([supportCase()])]))
  check(r.totalCases === 1, 'no-events: totalCases 1')
  check(r.casesWithServiceEvents === 0, 'no-events: casesWithServiceEvents 0')
  check(r.totalServiceEvents === 0, 'no-events: totalServiceEvents 0')
}

// 3. reassigned event
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('reassigned')] }),
  ])]))
  check(r.byKind.reassigned === 1, 'reassigned: byKind.reassigned 1')
  check(r.casesWithServiceEvents === 1, 'reassigned: casesWithServiceEvents 1')
  check(r.totalServiceEvents === 1, 'reassigned: totalServiceEvents 1')
  check(r.escalatedCases === 0, 'reassigned: escalatedCases 0 (not escalated)')
}

// 4. escalated event → escalatedCases counts
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('escalated')] }),
  ])]))
  check(r.byKind.escalated === 1, 'escalated: byKind.escalated 1')
  check(r.escalatedCases === 1, 'escalated: escalatedCases 1')
}

// 5. acknowledged event
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('acknowledged')] }),
  ])]))
  check(r.byKind.acknowledged === 1, 'acknowledged: byKind.acknowledged 1')
}

// 6. first_response_ready event
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('first_response_ready')] }),
  ])]))
  check(r.byKind.firstResponseReady === 1, 'first-response-ready: byKind.firstResponseReady 1')
}

// 7. All four kinds in one case
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [
      serviceEvent('reassigned'),
      serviceEvent('escalated'),
      serviceEvent('acknowledged'),
      serviceEvent('first_response_ready'),
    ] }),
  ])]))
  check(r.byKind.reassigned === 1, 'all-kinds: reassigned 1')
  check(r.byKind.escalated === 1, 'all-kinds: escalated 1')
  check(r.byKind.acknowledged === 1, 'all-kinds: acknowledged 1')
  check(r.byKind.firstResponseReady === 1, 'all-kinds: firstResponseReady 1')
  check(r.totalServiceEvents === 4, 'all-kinds: totalServiceEvents 4')
  check(r.escalatedCases === 1, 'all-kinds: escalatedCases 1')
}

// 8. escalation in followUpServiceEvents still increments escalatedCases
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ followUpEvents: [serviceEvent('escalated')] }),
  ])]))
  check(r.escalatedCases === 1, 'followup-escalation: escalatedCases 1')
  check(r.followUpServiceEventCases === 1, 'followup-escalation: followUpServiceEventCases 1')
  check(r.casesWithServiceEvents === 0, 'followup-escalation: casesWithServiceEvents 0 (no primary events)')
  check(r.totalServiceEvents === 1, 'followup-escalation: totalServiceEvents 1 (followUp counted)')
}

// 9. Multiple cases — only one escalated → escalatedCases = 1
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('escalated')] }),
    supportCase({ events: [serviceEvent('acknowledged')] }),
  ])]))
  check(r.escalatedCases === 1, 'multi-case: escalatedCases 1')
  check(r.casesWithServiceEvents === 2, 'multi-case: casesWithServiceEvents 2')
  check(r.totalServiceEvents === 2, 'multi-case: totalServiceEvents 2')
}

// 10. Multiple escalations in same case → escalatedCases = 1 (per-case, not per-event)
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ events: [serviceEvent('escalated'), serviceEvent('escalated')] }),
  ])]))
  check(r.byKind.escalated === 2, 'double-escalation: escalated event count 2')
  check(r.escalatedCases === 1, 'double-escalation: escalatedCases 1 (case count, not events)')
}

// 11. Across multiple orders
{
  const r = projectShopOrderSupportServiceEventBrief(state([
    order([supportCase({ events: [serviceEvent('reassigned')] })]),
    order([supportCase({ events: [serviceEvent('escalated')] }), supportCase()]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.casesWithServiceEvents === 2, 'multi-order: casesWithServiceEvents 2')
  check(r.byKind.reassigned === 1, 'multi-order: reassigned 1')
  check(r.byKind.escalated === 1, 'multi-order: escalated 1')
}

// 12. followUpServiceEventCases counts distinct cases
{
  const r = projectShopOrderSupportServiceEventBrief(state([order([
    supportCase({ followUpEvents: [serviceEvent('acknowledged'), serviceEvent('first_response_ready')] }),
  ])]))
  check(r.followUpServiceEventCases === 1, 'followup-multi: followUpServiceEventCases 1')
  check(r.byKind.acknowledged === 1, 'followup-multi: acknowledged counted')
  check(r.byKind.firstResponseReady === 1, 'followup-multi: firstResponseReady counted')
  check(r.totalServiceEvents === 2, 'followup-multi: totalServiceEvents 2')
}

console.log(JSON.stringify({ ok: true, checks }))
