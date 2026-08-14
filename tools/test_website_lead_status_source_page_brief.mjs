// Website lead status + sourcePage brief: 3-value pipeline enum + page top-5.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadStatusSourcePageBrief } from './website-lead-status-source-page-brief.ts'`,
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

const { projectWebsiteLeadStatusSourcePageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead({ status = 'new', sourcePage = '/home' } = {}) {
  leadId++
  return {
    id: `LD-${leadId}`,
    siteName: 'Test Site',
    sourcePage,
    name: `Customer ${leadId}`,
    contact: `c${leadId}@example.com`,
    request: 'Test request',
    consentRecorded: true,
    status,
    owner: '',
    decisionNote: '',
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
  }
}

function ledger(leads) {
  return { schema: 'supermega.website.lead-ledger.v1', revision: 1, leads }
}

// 1. Empty ledger
{
  const r = projectWebsiteLeadStatusSourcePageBrief(ledger([]))
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.newCount === 0, 'empty: newCount 0')
  check(r.qualifiedCount === 0, 'empty: qualifiedCount 0')
  check(r.closedCount === 0, 'empty: closedCount 0')
  check(r.newRate === 0, 'empty: newRate 0')
  check(r.uniqueSourcePages === 0, 'empty: uniqueSourcePages 0')
  check(r.topSourcePagesByCount.length === 0, 'empty: top empty')
}

// 2. All new
{
  const r = projectWebsiteLeadStatusSourcePageBrief(
    ledger([lead({ status: 'new' }), lead({ status: 'new' })]),
  )
  check(r.newCount === 2, 'all-new: newCount 2')
  check(r.newRate === 100, 'all-new: newRate 100')
  check(r.qualifiedRate === 0, 'all-new: qualifiedRate 0')
  check(r.closedRate === 0, 'all-new: closedRate 0')
}

// 3. All qualified
{
  const r = projectWebsiteLeadStatusSourcePageBrief(ledger([lead({ status: 'qualified' })]))
  check(r.qualifiedCount === 1, 'all-q: qualifiedCount 1')
  check(r.qualifiedRate === 100, 'all-q: qualifiedRate 100')
}

// 4. All closed
{
  const r = projectWebsiteLeadStatusSourcePageBrief(ledger([lead({ status: 'closed' })]))
  check(r.closedCount === 1, 'all-c: closedCount 1')
  check(r.closedRate === 100, 'all-c: closedRate 100')
}

// 5. Mixed pipeline (1 each → 33%)
{
  const r = projectWebsiteLeadStatusSourcePageBrief(
    ledger([lead({ status: 'new' }), lead({ status: 'qualified' }), lead({ status: 'closed' })]),
  )
  check(r.totalLeads === 3, 'mixed: totalLeads 3')
  check(r.newRate === 33, 'mixed: newRate 33')
  check(r.qualifiedRate === 33, 'mixed: qualifiedRate 33')
  check(r.closedRate === 33, 'mixed: closedRate 33')
}

// 6. Status counts sum to total
{
  const r = projectWebsiteLeadStatusSourcePageBrief(
    ledger([lead({ status: 'new' }), lead({ status: 'qualified' }), lead({ status: 'new' })]),
  )
  check(r.newCount + r.qualifiedCount + r.closedCount === r.totalLeads, 'invariant: counts sum')
}

// 7. Source page distribution
{
  const r = projectWebsiteLeadStatusSourcePageBrief(
    ledger([
      lead({ sourcePage: '/home' }),
      lead({ sourcePage: '/home' }),
      lead({ sourcePage: '/contact' }),
    ]),
  )
  check(r.uniqueSourcePages === 2, 'pages: uniqueSourcePages 2')
  check(r.topSourcePagesByCount[0]?.sourcePage === '/home', 'pages: top page /home')
  check(r.topSourcePagesByCount[0]?.count === 2, 'pages: /home count 2')
  check(r.topSourcePagesByCount[1]?.sourcePage === '/contact', 'pages: second /contact')
}

// 8. Top-5 cap + alphabetical tiebreak
{
  const pages = ['/zebra', '/alpha', '/charlie', '/bravo', '/delta', '/echo']
  const r = projectWebsiteLeadStatusSourcePageBrief(ledger(pages.map(p => lead({ sourcePage: p }))))
  check(r.topSourcePagesByCount.length === 5, 'top5: capped at 5')
  check(r.topSourcePagesByCount[0]?.sourcePage === '/alpha', 'top5: alpha tiebreak /alpha first')
}

// 9. Rounding: 2/3 → 67%, 1/3 → 33%
{
  const r = projectWebsiteLeadStatusSourcePageBrief(
    ledger([lead({ status: 'new' }), lead({ status: 'new' }), lead({ status: 'qualified' })]),
  )
  check(r.newRate === 67, 'round: newRate 67')
  check(r.qualifiedRate === 33, 'round: qualifiedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
