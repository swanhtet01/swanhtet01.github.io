// Website lead owner brief: owner distribution + decisionNote distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadOwnerBrief } from './website-lead-owner-brief.ts'`,
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

const { projectWebsiteLeadOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead({ owner = '', decisionNote = '', status = 'new' } = {}) {
  leadId++
  return {
    id: `LEAD-${leadId}`,
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
    status,
    sourcePage: '/home',
    name: `Customer ${leadId}`,
    contact: `customer${leadId}@example.com`,
    request: 'Interested in product',
    owner,
    decisionNote,
  }
}

function ledger(leads) {
  return { leads }
}

// 1. Empty ledger → all zeros
{
  const r = projectWebsiteLeadOwnerBrief(ledger([]))
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.assignedLeads === 0, 'empty: assignedLeads 0')
  check(r.assignmentRate === 0, 'empty: assignmentRate 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.topOwnersByCount.length === 0, 'empty: topOwners empty')
  check(r.leadsWithDecisionNote === 0, 'empty: leadsWithDecisionNote 0')
  check(r.decisionNoteRate === 0, 'empty: decisionNoteRate 0')
  check(r.uniqueDecisionNotes === 0, 'empty: uniqueDecisionNotes 0')
  check(r.topDecisionNotesByCount.length === 0, 'empty: topNotes empty')
}

// 2. All new leads — no owner, no decisionNote
{
  const r = projectWebsiteLeadOwnerBrief(ledger([lead(), lead(), lead()]))
  check(r.totalLeads === 3, 'new: totalLeads 3')
  check(r.assignedLeads === 0, 'new: assignedLeads 0')
  check(r.assignmentRate === 0, 'new: assignmentRate 0')
  check(r.leadsWithDecisionNote === 0, 'new: leadsWithDecisionNote 0')
}

// 3. Single qualified lead — owner set
{
  const r = projectWebsiteLeadOwnerBrief(ledger([lead({ owner: 'sales-1', status: 'qualified' })]))
  check(r.totalLeads === 1, 'qualified: totalLeads 1')
  check(r.assignedLeads === 1, 'qualified: assignedLeads 1')
  check(r.assignmentRate === 100, 'qualified: assignmentRate 100')
  check(r.uniqueOwners === 1, 'qualified: uniqueOwners 1')
  check(r.topOwnersByCount[0]?.owner === 'sales-1', 'qualified: top owner')
  check(r.topOwnersByCount[0]?.count === 1, 'qualified: top owner count 1')
}

// 4. Single closed lead — owner + decisionNote
{
  const r = projectWebsiteLeadOwnerBrief(
    ledger([lead({ owner: 'sales-2', decisionNote: 'Price not right', status: 'closed' })]),
  )
  check(r.assignedLeads === 1, 'closed: assignedLeads 1')
  check(r.leadsWithDecisionNote === 1, 'closed: leadsWithDecisionNote 1')
  check(r.decisionNoteRate === 100, 'closed: decisionNoteRate 100')
  check(r.uniqueDecisionNotes === 1, 'closed: uniqueDecisionNotes 1')
  check(r.topDecisionNotesByCount[0]?.note === 'Price not right', 'closed: top note')
}

// 5. Owner distribution
{
  const r = projectWebsiteLeadOwnerBrief(
    ledger([
      lead({ owner: 'sales-1', status: 'qualified' }),
      lead({ owner: 'sales-1', status: 'qualified' }),
      lead({ owner: 'sales-2', status: 'closed', decisionNote: 'Won' }),
    ]),
  )
  check(r.totalLeads === 3, 'dist: totalLeads 3')
  check(r.assignedLeads === 3, 'dist: assignedLeads 3')
  check(r.assignmentRate === 100, 'dist: assignmentRate 100')
  check(r.uniqueOwners === 2, 'dist: uniqueOwners 2')
  check(r.topOwnersByCount[0]?.owner === 'sales-1', 'dist: top owner sales-1')
  check(r.topOwnersByCount[0]?.count === 2, 'dist: top count 2')
}

// 6. Decision note distribution
{
  const r = projectWebsiteLeadOwnerBrief(
    ledger([
      lead({ owner: 'sales-1', decisionNote: 'Won', status: 'closed' }),
      lead({ owner: 'sales-1', decisionNote: 'Won', status: 'closed' }),
      lead({ owner: 'sales-2', decisionNote: 'Budget', status: 'closed' }),
    ]),
  )
  check(r.uniqueDecisionNotes === 2, 'note-dist: uniqueDecisionNotes 2')
  check(r.topDecisionNotesByCount[0]?.note === 'Won', 'note-dist: top note Won')
  check(r.topDecisionNotesByCount[0]?.count === 2, 'note-dist: count 2')
}

// 7. Mixed — some assigned, some not
{
  const r = projectWebsiteLeadOwnerBrief(
    ledger([
      lead({ owner: 'sales-1', status: 'qualified' }),
      lead(),
      lead({ owner: 'sales-2', decisionNote: 'Won', status: 'closed' }),
      lead(),
    ]),
  )
  check(r.totalLeads === 4, 'mixed: totalLeads 4')
  check(r.assignedLeads === 2, 'mixed: assignedLeads 2')
  check(r.assignmentRate === 50, 'mixed: assignmentRate 50')
  check(r.leadsWithDecisionNote === 1, 'mixed: leadsWithDecisionNote 1')
  check(r.decisionNoteRate === 25, 'mixed: decisionNoteRate 25')
}

// 8. Top-5 cap + tiebreak on owners
{
  const owners = ['Z-sales', 'A-sales', 'C-sales', 'B-sales', 'D-sales', 'E-sales']
  const r = projectWebsiteLeadOwnerBrief(
    ledger(owners.map(o => lead({ owner: o, status: 'qualified' }))),
  )
  check(r.topOwnersByCount.length === 5, 'top5-owner: capped at 5')
  check(r.topOwnersByCount[0]?.owner === 'A-sales', 'top5-owner: tiebreak A-sales first')
}

// 9. Top-5 cap + tiebreak on decision notes
{
  const notes = ['Z-note', 'A-note', 'C-note', 'B-note', 'D-note', 'E-note']
  const r = projectWebsiteLeadOwnerBrief(
    ledger(notes.map(n => lead({ owner: 'sales-1', decisionNote: n, status: 'closed' }))),
  )
  check(r.topDecisionNotesByCount.length === 5, 'top5-note: capped at 5')
  check(r.topDecisionNotesByCount[0]?.note === 'A-note', 'top5-note: tiebreak A-note first')
}

// 10. Assignment rate rounds: 1 of 3 → 33%
{
  const r = projectWebsiteLeadOwnerBrief(
    ledger([lead({ owner: 'sales-1', status: 'qualified' }), lead(), lead()]),
  )
  check(r.assignmentRate === 33, 'round: assignmentRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
