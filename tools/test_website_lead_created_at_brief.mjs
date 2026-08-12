import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadCreatedAtBrief } from './website-lead-created-at-brief.ts'`,
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

const { projectWebsiteLeadCreatedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead(createdAt = '2026-08-01T10:00:00Z') {
  leadId++
  return {
    id: `lead-${leadId}`,
    siteName: 'Test Site',
    sourcePage: '/contact',
    name: `Customer ${leadId}`,
    contact: `customer${leadId}@example.com`,
    request: 'I need help',
    consentRecorded: true,
    status: 'new',
    owner: 'alice',
    decisionNote: '',
    createdAt,
    updatedAt: createdAt,
  }
}

function ledger(leads = []) {
  return {
    schema: 'supermega.website.lead-ledger.v1',
    revision: 0,
    leads,
  }
}

// 1. Empty ledger
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger())
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single lead — spannedDays 0
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger([
    lead('2026-08-01T09:00:00Z'),
  ]))
  check(r.totalLeads === 1, 'single: totalLeads 1')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T09:00:00Z', 'single: latestCreatedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two leads same day — spannedDays 0
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger([
    lead('2026-08-05T08:00:00Z'),
    lead('2026-08-05T16:00:00Z'),
  ]))
  check(r.totalLeads === 2, 'same-day: totalLeads 2')
  check(r.earliestCreatedAt === '2026-08-05T08:00:00Z', 'same-day: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T16:00:00Z', 'same-day: latestCreatedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two leads 14 days apart
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger([
    lead('2026-07-18T00:00:00Z'),
    lead('2026-08-01T00:00:00Z'),
  ]))
  check(r.totalLeads === 2, '14-days: totalLeads 2')
  check(r.earliestCreatedAt === '2026-07-18T00:00:00Z', '14-days: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T00:00:00Z', '14-days: latestCreatedAt')
  check(r.spannedDays === 14, '14-days: spannedDays 14')
}

// 5. Three leads out of order — earliest/latest correct
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger([
    lead('2026-08-10T08:00:00Z'),
    lead('2026-08-02T12:00:00Z'),
    lead('2026-08-06T15:00:00Z'),
  ]))
  check(r.totalLeads === 3, 'unsorted: totalLeads 3')
  check(r.earliestCreatedAt === '2026-08-02T12:00:00Z', 'unsorted: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T08:00:00Z', 'unsorted: latestCreatedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. All same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectWebsiteLeadCreatedAtBrief(ledger([
    lead('2026-08-08T00:00:00Z'),
    lead('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalLeads === 2, 'same-ts: totalLeads 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestCreatedAt === r.latestCreatedAt, 'same-ts: earliest equals latest')
}

console.log(`website-lead-created-at-brief: ${checks} checks passed`)
