import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadDecisionAgeBrief } from './website-lead-decision-age-brief.ts'`,
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

const { projectWebsiteLeadDecisionAgeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead({ status = 'new', decisionNote = '', createdAt = '2026-08-01T09:00:00Z', updatedAt = '2026-08-01T09:00:00Z' } = {}) {
  leadId++
  return {
    id: `LEAD-${leadId}`,
    createdAt,
    updatedAt,
    status,
    sourcePage: '/home',
    name: `Customer ${leadId}`,
    contact: `customer${leadId}@example.com`,
    request: 'Interested in product',
    consentRecorded: true,
    owner: status === 'new' ? '' : 'sales-1',
    decisionNote,
  }
}

function ledger(leads) {
  return { leads }
}

// 1. Empty ledger
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([]))
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.decidedLeadCount === 0, 'empty: decidedLeadCount 0')
  check(r.withDecisionNoteCount === 0, 'empty: withDecisionNoteCount 0')
  check(r.withDecisionNoteRate === 0, 'empty: withDecisionNoteRate 0')
  check(r.shortNoteCount === 0, 'empty: shortNoteCount 0')
  check(r.mediumNoteCount === 0, 'empty: mediumNoteCount 0')
  check(r.longNoteCount === 0, 'empty: longNoteCount 0')
  check(r.averageDecisionNoteLength === 0, 'empty: averageDecisionNoteLength 0')
  check(r.averageDecisionAgeHours === 0, 'empty: averageDecisionAgeHours 0')
  check(r.minDecisionAgeHours === null, 'empty: minDecisionAgeHours null')
  check(r.maxDecisionAgeHours === null, 'empty: maxDecisionAgeHours null')
}

// 2. All new leads — no decisions, no notes
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([lead(), lead(), lead()]))
  check(r.totalLeads === 3, 'new: totalLeads 3')
  check(r.decidedLeadCount === 0, 'new: decidedLeadCount 0')
  check(r.averageDecisionAgeHours === 0, 'new: averageDecisionAgeHours 0')
  check(r.minDecisionAgeHours === null, 'new: minDecisionAgeHours null')
}

// 3. Single qualified lead — 24h decision age, short note
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([
    lead({
      status: 'qualified',
      decisionNote: 'Good fit',  // 8 chars → short
      createdAt: '2026-08-01T09:00:00Z',
      updatedAt: '2026-08-02T09:00:00Z',  // 24h later
    }),
  ]))
  check(r.totalLeads === 1, 'qualified: totalLeads 1')
  check(r.decidedLeadCount === 1, 'qualified: decidedLeadCount 1')
  check(r.withDecisionNoteCount === 1, 'qualified: withDecisionNoteCount 1')
  check(r.withDecisionNoteRate === 100, 'qualified: withDecisionNoteRate 100')
  check(r.shortNoteCount === 1, 'qualified: shortNoteCount 1')
  check(r.mediumNoteCount === 0, 'qualified: mediumNoteCount 0')
  check(r.averageDecisionAgeHours === 24, 'qualified: averageDecisionAgeHours 24')
  check(r.minDecisionAgeHours === 24, 'qualified: minDecisionAgeHours 24')
  check(r.maxDecisionAgeHours === 24, 'qualified: maxDecisionAgeHours 24')
}

// 4. Closed lead with no note — age still tracked
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([
    lead({
      status: 'closed',
      decisionNote: '',
      createdAt: '2026-08-01T09:00:00Z',
      updatedAt: '2026-08-03T09:00:00Z',  // 48h later
    }),
  ]))
  check(r.decidedLeadCount === 1, 'closed-no-note: decidedLeadCount 1')
  check(r.withDecisionNoteCount === 0, 'closed-no-note: withDecisionNoteCount 0')
  check(r.averageDecisionAgeHours === 48, 'closed-no-note: averageDecisionAgeHours 48')
}

// 5. Note length boundaries
{
  const shortNote = 'A'.repeat(40)   // ≤40 → short
  const medNote = 'B'.repeat(80)     // 41–120 → medium
  const longNote = 'C'.repeat(150)   // >120 → long
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([
    lead({ status: 'qualified', decisionNote: shortNote }),
    lead({ status: 'qualified', decisionNote: medNote }),
    lead({ status: 'closed', decisionNote: longNote }),
  ]))
  check(r.shortNoteCount === 1, 'note-boundaries: shortNoteCount 1')
  check(r.mediumNoteCount === 1, 'note-boundaries: mediumNoteCount 1')
  check(r.longNoteCount === 1, 'note-boundaries: longNoteCount 1')
  check(r.withDecisionNoteCount === 3, 'note-boundaries: withDecisionNoteCount 3')
  check(r.withDecisionNoteRate === 100, 'note-boundaries: withDecisionNoteRate 100')
  check(r.averageDecisionNoteLength === Math.round((40 + 80 + 150) / 3), 'note-boundaries: averageDecisionNoteLength')
}

// 6. Mixed: new + decided leads, age averaging
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([
    lead({ status: 'new' }),  // not decided
    lead({ status: 'qualified', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z' }), // 24h
    lead({ status: 'closed', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-04T00:00:00Z' }),   // 72h
  ]))
  check(r.totalLeads === 3, 'mixed: totalLeads 3')
  check(r.decidedLeadCount === 2, 'mixed: decidedLeadCount 2')
  check(r.averageDecisionAgeHours === 48, 'mixed: averageDecisionAgeHours 48')
  check(r.minDecisionAgeHours === 24, 'mixed: minDecisionAgeHours 24')
  check(r.maxDecisionAgeHours === 72, 'mixed: maxDecisionAgeHours 72')
}

// 7. withDecisionNoteRate with partial notes
{
  const r = projectWebsiteLeadDecisionAgeBrief(ledger([
    lead({ status: 'qualified', decisionNote: 'Note here' }),
    lead({ status: 'qualified', decisionNote: '' }),
    lead({ status: 'new', decisionNote: '' }),
  ]))
  check(r.totalLeads === 3, 'partial-notes: totalLeads 3')
  check(r.withDecisionNoteCount === 1, 'partial-notes: withDecisionNoteCount 1')
  check(r.withDecisionNoteRate === 33, 'partial-notes: withDecisionNoteRate 33')
}

console.log(`website-lead-decision-age-brief: ${checks} checks passed`)
