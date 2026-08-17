// Shop order support note brief: resolution.note, reopen.note, followUpResolution.note.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportNoteBrief } from './shop-order-support-note-brief.ts'`,
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

const { projectShopOrderSupportNoteBrief } = await import(
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

function supportCase({ resolution, reopen, followUpResolution } = {}) {
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
  if (resolution !== undefined) base.resolution = resolution
  if (reopen !== undefined) base.reopen = reopen
  if (followUpResolution !== undefined) base.followUpResolution = followUpResolution
  return base
}

function resolution(note) {
  const base = { outcome: 'resolved', resolvedAt: '2026-08-10T09:00:00Z', proof: PROOF }
  if (note !== undefined) base.note = note
  return base
}

function reopen(note) {
  const base = { priority: 'high', dueAt: '2026-08-15T00:00:00Z', proof: PROOF }
  if (note !== undefined) base.note = note
  return base
}

function followUp(note) {
  const base = { outcome: 'resolved', resolvedAt: '2026-08-12T09:00:00Z', proof: PROOF }
  if (note !== undefined) base.note = note
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
  const r = projectShopOrderSupportNoteBrief(state([]))
  check(r.totalSupportCases === 0, 'empty: totalSupportCases 0')
  check(r.casesWithResolutionNote === 0, 'empty: casesWithResolutionNote 0')
  check(r.resolutionNoteRate === 0, 'empty: resolutionNoteRate 0')
  check(r.averageResolutionNoteLength === 0, 'empty: averageResolutionNoteLength 0')
  check(r.casesWithReopenNote === 0, 'empty: casesWithReopenNote 0')
  check(r.reopenNoteRate === 0, 'empty: reopenNoteRate 0')
  check(r.casesWithFollowUpResolutionNote === 0, 'empty: casesWithFollowUpResolutionNote 0')
}

// 2. Case with no notes
{
  const r = projectShopOrderSupportNoteBrief(state([order([supportCase()])]))
  check(r.totalSupportCases === 1, 'no-notes: totalSupportCases 1')
  check(r.casesWithResolutionNote === 0, 'no-notes: casesWithResolutionNote 0')
  check(r.resolutionNoteRate === 0, 'no-notes: resolutionNoteRate 0')
  check(r.casesWithReopenNote === 0, 'no-notes: casesWithReopenNote 0')
  check(r.casesWithFollowUpResolutionNote === 0, 'no-notes: casesWithFollowUpResolutionNote 0')
}

// 3. Case with resolution note only
{
  const r = projectShopOrderSupportNoteBrief(state([
    order([supportCase({ resolution: resolution('Issue fully resolved.') })]),
  ]))
  check(r.casesWithResolutionNote === 1, 'res-note: casesWithResolutionNote 1')
  check(r.resolutionNoteRate === 100, 'res-note: resolutionNoteRate 100')
  check(r.averageResolutionNoteLength === 21, 'res-note: averageResolutionNoteLength 21')
}

// 4. Case with reopen note
{
  const r = projectShopOrderSupportNoteBrief(state([
    order([supportCase({ reopen: reopen('Still unresolved.') })]),
  ]))
  check(r.casesWithReopenNote === 1, 'reopen-note: casesWithReopenNote 1')
  check(r.reopenNoteRate === 100, 'reopen-note: reopenNoteRate 100')
  check(r.averageReopenNoteLength === 17, 'reopen-note: averageReopenNoteLength 17')
}

// 5. Case with followUpResolution note
{
  const r = projectShopOrderSupportNoteBrief(state([
    order([supportCase({ followUpResolution: followUp('Verified OK.') })]),
  ]))
  check(r.casesWithFollowUpResolutionNote === 1, 'followup-note: casesWithFollowUpResolutionNote 1')
  check(r.followUpResolutionNoteRate === 100, 'followup-note: followUpResolutionNoteRate 100')
}

// 6. Resolution without note: note is optional
{
  const r = projectShopOrderSupportNoteBrief(state([
    order([supportCase({ resolution: resolution() })]),
  ]))
  check(r.casesWithResolutionNote === 0, 'no-res-note: casesWithResolutionNote 0')
  check(r.averageResolutionNoteLength === 0, 'no-res-note: averageResolutionNoteLength 0')
}

// 7. Mixed: multiple cases with different notes
{
  const r = projectShopOrderSupportNoteBrief(state([
    order([
      supportCase({ resolution: resolution('Fixed.') }),
      supportCase({ resolution: resolution('Refunded.'), reopen: reopen('Not happy.') }),
      supportCase({ followUpResolution: followUp('All good now.') }),
      supportCase(),
    ]),
  ]))
  check(r.totalSupportCases === 4, 'mixed: totalSupportCases 4')
  check(r.casesWithResolutionNote === 2, 'mixed: casesWithResolutionNote 2')
  check(r.resolutionNoteRate === 50, 'mixed: resolutionNoteRate 50')
  check(r.averageResolutionNoteLength === 8, 'mixed: avg (6+10)/2=8')
  check(r.casesWithReopenNote === 1, 'mixed: casesWithReopenNote 1')
  check(r.reopenNoteRate === 25, 'mixed: reopenNoteRate 25')
  check(r.casesWithFollowUpResolutionNote === 1, 'mixed: casesWithFollowUpResolutionNote 1')
  check(r.followUpResolutionNoteRate === 25, 'mixed: followUpResolutionNoteRate 25')
}

console.log(JSON.stringify({ ok: true, checks }))
