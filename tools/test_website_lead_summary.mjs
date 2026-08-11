// Website lead summary: conversion funnel projection from WebsiteLeadLedger.
// Tests status classification, source-page grouping, conversion rates, date filtering.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadSummary } from './website-lead-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/lead-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteLeadSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function makeLedger(leads = []) {
  return { schema: 'supermega.website.lead-ledger.v1', revision: 1, leads }
}

function makeLead(id, status, sourcePage = 'contact', extra = {}) {
  return {
    id,
    siteName: 'Acme Co',
    sourcePage,
    name: 'Test User',
    contact: 'test@example.com',
    request: 'Need help',
    consentRecorded: true,
    status,
    owner: 'owner@example.com',
    decisionNote: '',
    createdAt: '2026-08-11T09:00:00.000Z',
    updatedAt: '2026-08-11T09:00:00.000Z',
    ...extra,
  }
}

// 1. Empty ledger → all zeros
{
  const r = projectWebsiteLeadSummary(makeLedger())
  check(r.totalLeads === 0, 'totalLeads = 0 for empty ledger')
  check(r.newLeads === 0, 'newLeads = 0 for empty ledger')
  check(r.qualifiedLeads === 0, 'qualifiedLeads = 0 for empty ledger')
  check(r.closedLeads === 0, 'closedLeads = 0 for empty ledger')
  check(r.qualificationRate === 0, 'qualificationRate = 0 for empty ledger')
  check(r.closureRate === 0, 'closureRate = 0 for empty ledger')
  check(Object.keys(r.bySourcePage).length === 0, 'bySourcePage empty for empty ledger')
}

// 2. Single new lead
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'new')]))
  check(r.totalLeads === 1, 'totalLeads = 1')
  check(r.newLeads === 1, 'newLeads = 1')
  check(r.qualifiedLeads === 0, 'qualifiedLeads = 0')
  check(r.closedLeads === 0, 'closedLeads = 0')
}

// 3. Qualified lead status
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'qualified')]))
  check(r.qualifiedLeads === 1, 'qualified lead counted')
  check(r.newLeads === 0, 'not in newLeads')
  check(r.closedLeads === 0, 'not in closedLeads')
}

// 4. Closed lead status
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'closed')]))
  check(r.closedLeads === 1, 'closed lead counted')
  check(r.newLeads === 0, 'not in newLeads')
  check(r.qualifiedLeads === 0, 'not in qualifiedLeads')
}

// 5. qualificationRate = qualifiedLeads / totalLeads * 100
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new'),
    makeLead('L-002', 'qualified'),
    makeLead('L-003', 'qualified'),
    makeLead('L-004', 'new'),
  ]))
  check(r.qualificationRate === 50, 'qualificationRate = 50% for 2 qualified of 4')
}

// 6. closureRate = closedLeads / totalLeads * 100
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new'),
    makeLead('L-002', 'closed'),
    makeLead('L-003', 'new'),
    makeLead('L-004', 'new'),
    makeLead('L-005', 'new'),
  ]))
  check(r.closureRate === 20, 'closureRate = 20% for 1 closed of 5')
}

// 7. bySourcePage groups leads by source page
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new', 'home'),
    makeLead('L-002', 'qualified', 'home'),
    makeLead('L-003', 'closed', 'contact'),
  ]))
  check(r.bySourcePage['home']?.total === 2, 'home page: 2 total leads')
  check(r.bySourcePage['contact']?.total === 1, 'contact page: 1 total lead')
}

// 8. bySourcePage qualified and closed counts
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new', 'home'),
    makeLead('L-002', 'qualified', 'home'),
    makeLead('L-003', 'closed', 'home'),
  ]))
  check(r.bySourcePage['home']?.qualified === 1, 'bySourcePage qualified count correct')
  check(r.bySourcePage['home']?.closed === 1, 'bySourcePage closed count correct')
}

// 9. bySourcePage new leads NOT counted separately (only qualified and closed)
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'new', 'home')]))
  check(r.bySourcePage['home']?.total === 1, 'new lead in bySourcePage total')
  check(r.bySourcePage['home']?.qualified === 0, 'new lead not in bySourcePage qualified')
  check(r.bySourcePage['home']?.closed === 0, 'new lead not in bySourcePage closed')
}

// 10. date filter includes same-day leads
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'new')]), '2026-08-11')
  check(r.totalLeads === 1, 'same-day lead included by date filter')
}

// 11. date filter excludes different-day leads
{
  const r = projectWebsiteLeadSummary(makeLedger([makeLead('L-001', 'new')]), '2026-08-10')
  check(r.totalLeads === 0, 'different-day lead excluded by date filter')
}

// 12. no date filter includes all leads
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new'),
    makeLead('L-002', 'qualified', 'home', { createdAt: '2026-08-10T09:00:00.000Z', updatedAt: '2026-08-10T09:00:00.000Z' }),
  ]))
  check(r.totalLeads === 2, 'all leads included without date filter')
}

// 13. Mixed statuses totalLeads = new + qualified + closed
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'new'),
    makeLead('L-002', 'qualified'),
    makeLead('L-003', 'closed'),
  ]))
  check(r.totalLeads === 3, 'totalLeads = new + qualified + closed')
}

// 14. Multiple source pages tracked independently
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'qualified', 'home'),
    makeLead('L-002', 'qualified', 'services'),
    makeLead('L-003', 'closed', 'contact'),
  ]))
  check(Object.keys(r.bySourcePage).length === 3, '3 source pages in bySourcePage')
  check(r.bySourcePage['services']?.qualified === 1, 'services page: 1 qualified')
}

// 15. qualificationRate rounds correctly
{
  const r = projectWebsiteLeadSummary(makeLedger([
    makeLead('L-001', 'qualified'),
    makeLead('L-002', 'new'),
    makeLead('L-003', 'new'),
  ]))
  check(r.qualificationRate === 33, 'qualificationRate rounds 1/3 to 33%')
}

console.log(`website lead summary: ${checks} checks passed`)
