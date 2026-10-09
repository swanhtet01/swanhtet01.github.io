import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL(resolve('showroom/package.json')).href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `export * from './website-leads.ts'
export * from './website-inquiry-window.ts'`,
    resolveDir: resolve('showroom/src/products/website'),
    sourcefile: 'inquiry-window-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const { captureWebsiteLead, emptyWebsiteLeadLedger, reviewWebsiteLead, websiteInquiryViewReducer, websiteInquiryWindow } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let ledger = emptyWebsiteLeadLedger()
for (let index = 1; index <= 12; index += 1) {
  ledger = captureWebsiteLead(ledger, {
    siteName: 'Example business',
    sourcePage: 'contact',
    name: `Customer ${index}`,
    contact: `customer${index}@example.invalid`,
    request: 'Please call about stock.',
    consentRecorded: true,
  }, { id: `lead-${index}`, now: new Date(Date.UTC(2026, 9, 9, 8, index)).toISOString() })
}
ledger = reviewWebsiteLead(ledger, 'lead-11', { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T09:00:00.000Z')
ledger = reviewWebsiteLead(ledger, 'lead-10', { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T09:01:00.000Z')

const first = websiteInquiryWindow(ledger.leads, 'open', 0)
assert.equal(first.total, 10)
assert.equal(first.pageCount, 2)
assert.deepEqual([first.start, first.end], [1, 8])
assert.equal(first.items.length, 8)
const second = websiteInquiryWindow(ledger.leads, 'open', 1)
assert.deepEqual([second.start, second.end], [9, 10])
assert.deepEqual(second.items.map((lead) => lead.id), ['lead-2', 'lead-1'])
assert.equal(second.items[1].status, 'new', 'oldest unresolved inquiry remains actionable')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', 999).page, 1, 'repeated Next cannot leave the last page')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', -999).page, 0, 'repeated Previous cannot leave the first page')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', Number.NaN).page, 0)

const all = websiteInquiryWindow(ledger.leads, 'all', 0)
assert.equal(all.total, 12)
assert.equal(websiteInquiryWindow(ledger.leads, 'all', 1).items.length, 4)
assert.deepEqual(websiteInquiryWindow(ledger.leads, 'closed', 0).items.map((lead) => lead.id), ['lead-11', 'lead-10'])
assert.equal(websiteInquiryWindow(ledger.leads, 'closed', 1).page, 0, 'filter change clamps the page')
assert.equal(websiteInquiryWindow(ledger.leads, 'closed', 0).end, 2)

ledger = reviewWebsiteLead(ledger, second.items[1].id, { status: 'qualified', owner: 'Owner', decisionNote: '' }, '2026-10-09T09:02:00.000Z')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', 1).items[1].status, 'qualified')
ledger = reviewWebsiteLead(ledger, second.items[1].id, { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T09:03:00.000Z')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', 1).total, 9)
ledger = reviewWebsiteLead(ledger, 'lead-2', { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T09:04:00.000Z')
assert.equal(websiteInquiryWindow(ledger.leads, 'open', 1).page, 0, 'closing the last records clamps to a populated page')
assert.equal(websiteInquiryWindow(ledger.leads, 'closed', 0).total, 4)
assert.deepEqual(websiteInquiryWindow([], 'open', 5), { items: [], total: 0, page: 0, pageCount: 1, start: 0, end: 0 })

// Exercise the state transition the component dispatches after a decision and capture.
// A derived-only clamp used to show page one after shrink while storing page two;
// the next captured inquiry then jumped the operator back to page two.
let changingLedger = emptyWebsiteLeadLedger()
for (let index = 1; index <= 9; index += 1) {
  changingLedger = captureWebsiteLead(changingLedger, {
    siteName: 'Example business', sourcePage: 'contact', name: `Next customer ${index}`,
    contact: `next${index}@example.invalid`, request: 'Please call.', consentRecorded: true,
  }, { id: `next-${index}`, now: new Date(Date.UTC(2026, 9, 9, 10, index)).toISOString() })
}
let view = { filter: 'open', page: 0 }
view = websiteInquiryViewReducer(view, { type: 'page', page: 1, leads: changingLedger.leads })
assert.equal(view.page, 1, 'operator navigated to the ninth inquiry')
changingLedger = reviewWebsiteLead(changingLedger, 'next-1', { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T11:00:00.000Z')
view = websiteInquiryViewReducer(view, { type: 'ledger', leads: changingLedger.leads })
assert.equal(view.page, 0, 'closing the last open inquiry on page two updates stored page state')
changingLedger = captureWebsiteLead(changingLedger, {
  siteName: 'Example business', sourcePage: 'contact', name: 'Newest customer',
  contact: 'newest@example.invalid', request: 'Please call.', consentRecorded: true,
}, { id: 'next-10', now: '2026-10-09T11:01:00.000Z' })
view = websiteInquiryViewReducer(view, { type: 'ledger', leads: changingLedger.leads })
assert.equal(view.page, 0, 'capturing another inquiry does not restore the stale page')
assert.equal(websiteInquiryWindow(changingLedger.leads, view.filter, view.page).items[0].id, 'next-10')
view = websiteInquiryViewReducer(view, { type: 'page', page: 1, leads: changingLedger.leads })
view = websiteInquiryViewReducer(view, { type: 'page', page: 2, leads: changingLedger.leads })
assert.equal(view.page, 1, 'repeated Next stays on the last page')
view = websiteInquiryViewReducer(view, { type: 'filter', filter: 'closed' })
assert.deepEqual(view, { filter: 'closed', page: 0 }, 'filter change resets stored page')

// Managed mutations rebase on the queued workspace. The decision closure can
// hold an eight-row pre-await ledger while the confirmed result has nine rows.
let confirmedLedger = emptyWebsiteLeadLedger()
for (let index = 1; index <= 9; index += 1) {
  confirmedLedger = captureWebsiteLead(confirmedLedger, {
    siteName: 'Example business', sourcePage: 'contact', name: `Queued customer ${index}`,
    contact: `queued${index}@example.invalid`, request: 'Please call.', consentRecorded: true,
  }, { id: `queued-${index}`, now: new Date(Date.UTC(2026, 9, 9, 12, index)).toISOString() })
}
const staleDecision = reviewWebsiteLead(confirmedLedger, 'queued-1', { status: 'closed', owner: 'Owner', decisionNote: '' }, '2026-10-09T13:00:00.000Z')
assert.equal(websiteInquiryWindow(staleDecision.leads, 'open', 1).page, 0, 'pre-await decision snapshot would wrongly clamp')
let queue = Promise.resolve()
function enqueueManaged(update) {
  const pending = queue.then(async () => {
    confirmedLedger = await update(confirmedLedger)
    return { ok: true, workspace: { leadLedger: confirmedLedger } }
  })
  queue = pending.then(() => undefined)
  return pending
}
let releaseCapture
const captureGate = new Promise((resolve) => { releaseCapture = resolve })
const capturePending = enqueueManaged(async (current) => {
  await captureGate
  return captureWebsiteLead(current, {
    siteName: 'Example business', sourcePage: 'contact', name: 'Queued newest',
    contact: 'queued-newest@example.invalid', request: 'Please call.', consentRecorded: true,
  }, { id: 'queued-10', now: '2026-10-09T12:10:00.000Z' })
})
const decisionPending = enqueueManaged((current) => reviewWebsiteLead(current, 'queued-1', {
  status: 'closed', owner: 'Owner', decisionNote: '',
}, '2026-10-09T13:00:00.000Z'))
let queuedView = { filter: 'open', page: 1 }
assert.equal(confirmedLedger.leads.length, 9, 'capture is pending while decision is queued')
releaseCapture()
for (const result of [await capturePending, await decisionPending]) {
  queuedView = websiteInquiryViewReducer(queuedView, { type: 'confirmed', ledger: result.workspace.leadLedger })
}
assert.equal(confirmedLedger.leads.length, 10)
assert.equal(websiteInquiryWindow(confirmedLedger.leads, 'open', 1).total, 9)
assert.equal(queuedView.page, 1, 'rebased decision keeps the valid second page after overlapping capture')
console.log('Website inquiry window: 12-record, older-open, filters, page bounds, shrink-then-grow and queued-overlap state, decisions and empty checks passed')
