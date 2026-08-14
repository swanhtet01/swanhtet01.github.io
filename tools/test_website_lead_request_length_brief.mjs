// Website lead request length brief: short/medium/long bands + min/max/avg.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadRequestLengthBrief } from './website-lead-request-length-brief.ts'`,
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

const { projectWebsiteLeadRequestLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead({ request = 'Help me' } = {}) {
  leadId++
  return {
    id: `LD-${leadId}`,
    siteName: 'Test Site',
    sourcePage: '/home',
    name: `Customer ${leadId}`,
    contact: `c${leadId}@example.com`,
    request,
    consentRecorded: true,
    status: 'new',
    owner: '',
    decisionNote: '',
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
  }
}

function ledger(leads) {
  return { schema: 'supermega.website.lead-ledger.v1', revision: 1, leads }
}

const SHORT = 'Hi'                         // 2 chars — short (≤40)
const MEDIUM = 'A'.repeat(50)              // 50 chars — medium (41–120)
const LONG = 'B'.repeat(150)               // 150 chars — long (>120)
const EXACT_40 = 'C'.repeat(40)            // 40 chars — boundary short
const EXACT_41 = 'D'.repeat(41)            // 41 chars — boundary medium
const EXACT_120 = 'E'.repeat(120)          // 120 chars — boundary medium
const EXACT_121 = 'F'.repeat(121)          // 121 chars — boundary long

// 1. Empty ledger
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([]))
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.shortRequestCount === 0, 'empty: shortCount 0')
  check(r.minRequestLength === null, 'empty: min null')
  check(r.maxRequestLength === null, 'empty: max null')
  check(r.averageRequestLength === 0, 'empty: avg 0')
}

// 2. Short boundary checks
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: EXACT_40 })]))
  check(r.shortRequestCount === 1, 'short-bound: shortCount 1 (exactly 40 chars)')
}
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: EXACT_41 })]))
  check(r.mediumRequestCount === 1, 'medium-bound: mediumCount 1 (exactly 41 chars)')
}
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: EXACT_120 })]))
  check(r.mediumRequestCount === 1, 'medium-top-bound: mediumCount 1 (exactly 120 chars)')
}
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: EXACT_121 })]))
  check(r.longRequestCount === 1, 'long-bound: longCount 1 (exactly 121 chars)')
}

// 3. All short
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: SHORT }), lead({ request: SHORT })]))
  check(r.shortRequestCount === 2, 'all-short: shortCount 2')
  check(r.shortRequestRate === 100, 'all-short: shortRate 100')
  check(r.mediumRequestRate === 0, 'all-short: mediumRate 0')
}

// 4. All long
{
  const r = projectWebsiteLeadRequestLengthBrief(ledger([lead({ request: LONG })]))
  check(r.longRequestCount === 1, 'all-long: longCount 1')
  check(r.longRequestRate === 100, 'all-long: longRate 100')
}

// 5. Min/max detection
{
  const r = projectWebsiteLeadRequestLengthBrief(
    ledger([lead({ request: SHORT }), lead({ request: LONG }), lead({ request: MEDIUM })]),
  )
  check(r.minRequestLength === SHORT.length, 'min-max: min is SHORT.length')
  check(r.maxRequestLength === LONG.length, 'min-max: max is LONG.length')
}

// 6. Band counts sum to total
{
  const r = projectWebsiteLeadRequestLengthBrief(
    ledger([lead({ request: SHORT }), lead({ request: MEDIUM }), lead({ request: LONG })]),
  )
  check(r.shortRequestCount + r.mediumRequestCount + r.longRequestCount === r.totalLeads, 'invariant: bands sum to total')
}

// 7. Average request length rounding
{
  const r = projectWebsiteLeadRequestLengthBrief(
    ledger([lead({ request: 'AB' }), lead({ request: 'ABC' })]),  // 2 + 3 = 5 / 2 = 2.5 → 3
  )
  check(r.averageRequestLength === 3, 'round-avg: avg is 3 (round(2.5))')
}

// 8. Rounding: 1/3 → 33%
{
  const r = projectWebsiteLeadRequestLengthBrief(
    ledger([lead({ request: SHORT }), lead({ request: MEDIUM }), lead({ request: LONG })]),
  )
  check(r.shortRequestRate === 33, 'round-rate: shortRate 33')
  check(r.mediumRequestRate === 33, 'round-rate: mediumRate 33')
  check(r.longRequestRate === 33, 'round-rate: longRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
