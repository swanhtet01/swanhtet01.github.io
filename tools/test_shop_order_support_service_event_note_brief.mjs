// Shop order support service event note brief: note.length stats across all service events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportServiceEventNoteBrief } from './shop-order-support-service-event-note-brief.ts'`,
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

const { projectShopOrderSupportServiceEventNoteBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
let orderId = 0
let caseId = 0
let eventId = 0

function serviceEvent(note = 'Event note.') {
  eventId++
  return {
    kind: 'follow_up',
    owner: 'agent-1',
    priority: 'medium',
    dueAt: '2026-08-15T09:00:00Z',
    note,
    proof: { actionId: `EVT-${eventId}`, actorId: 'agent-1', timestamp: '2026-08-12T09:00:00Z' },
  }
}

function supportCase({ serviceEvents, followUpServiceEvents } = {}) {
  caseId++
  const base = {
    id: `CASE-${caseId}`,
    openedAt: '2026-08-01T09:00:00Z',
    customerDescription: 'A problem.',
    status: 'open',
    priority: 'medium',
  }
  if (serviceEvents !== undefined) base.serviceEvents = serviceEvents
  if (followUpServiceEvents !== undefined) base.followUpServiceEvents = followUpServiceEvents
  return base
}

function order({ supportCases } = {}) {
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
    ...(supportCases !== undefined ? { supportCases } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty orders → all zeros/nulls
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([]))
  check(r.totalServiceEvents === 0, 'empty: totalServiceEvents 0')
  check(r.totalNoteLength === 0, 'empty: totalNoteLength 0')
  check(r.averageNoteLength === 0, 'empty: averageNoteLength 0')
  check(r.minNoteLength === null, 'empty: minNoteLength null')
  check(r.maxNoteLength === null, 'empty: maxNoteLength null')
}

// 2. Order with no support cases → zero
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([order()]))
  check(r.totalServiceEvents === 0, 'no-cases: totalServiceEvents 0')
}

// 3. Support case with no events → zero
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([order({ supportCases: [supportCase()] })]))
  check(r.totalServiceEvents === 0, 'no-events: totalServiceEvents 0')
  check(r.minNoteLength === null, 'no-events: min null')
}

// 4. Single serviceEvent
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([
    order({ supportCases: [supportCase({ serviceEvents: [serviceEvent('short')] })] }),
  ]))
  check(r.totalServiceEvents === 1, 'single: totalServiceEvents 1')
  check(r.totalNoteLength === 5, 'single: totalNoteLength 5 (len("short"))')
  check(r.averageNoteLength === 5, 'single: averageNoteLength 5')
  check(r.minNoteLength === 5, 'single: minNoteLength 5')
  check(r.maxNoteLength === 5, 'single: maxNoteLength 5')
}

// 5. followUpServiceEvents are also counted
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([
    order({ supportCases: [
      supportCase({
        serviceEvents: [serviceEvent('AB')],
        followUpServiceEvents: [serviceEvent('ABCDE')],
      }),
    ] }),
  ]))
  check(r.totalServiceEvents === 2, 'followup: totalServiceEvents 2')
  check(r.totalNoteLength === 7, 'followup: totalNoteLength 7')
  check(r.minNoteLength === 2, 'followup: minNoteLength 2')
  check(r.maxNoteLength === 5, 'followup: maxNoteLength 5')
}

// 6. Multiple orders and cases: min/max/average
{
  const note10 = 'X'.repeat(10)
  const note30 = 'Y'.repeat(30)
  const note20 = 'Z'.repeat(20)
  const r = projectShopOrderSupportServiceEventNoteBrief(state([
    order({ supportCases: [supportCase({ serviceEvents: [serviceEvent(note10), serviceEvent(note30)] })] }),
    order({ supportCases: [supportCase({ serviceEvents: [serviceEvent(note20)] })] }),
  ]))
  check(r.totalServiceEvents === 3, 'multi: totalServiceEvents 3')
  check(r.totalNoteLength === 60, 'multi: totalNoteLength 60')
  check(r.averageNoteLength === 20, 'multi: averageNoteLength 20')
  check(r.minNoteLength === 10, 'multi: minNoteLength 10')
  check(r.maxNoteLength === 30, 'multi: maxNoteLength 30')
}

// 7. Rounding: 10/3 ≈ 3 (round down)
{
  const r = projectShopOrderSupportServiceEventNoteBrief(state([
    order({ supportCases: [supportCase({ serviceEvents: [serviceEvent('ABC'), serviceEvent('DEF'), serviceEvent('GH')] })] }),
  ]))
  check(r.totalNoteLength === 8, 'rounding: totalNoteLength 8')
  check(r.averageNoteLength === 3, 'rounding: averageNoteLength 3 (8/3 ≈ 3)')
}

console.log(JSON.stringify({ ok: true, checks }))
