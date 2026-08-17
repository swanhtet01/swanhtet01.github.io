import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadNameBrief } from './website-lead-name-brief.ts'`,
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

const { projectWebsiteLeadNameBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead(name = 'Alice') {
  leadId++
  return {
    id: `lead-${leadId}`,
    siteName: 'Test Site',
    sourcePage: '/contact',
    name,
    contact: `customer${leadId}@example.com`,
    request: 'I need help',
    consentRecorded: true,
    status: 'new',
    owner: 'alice',
    decisionNote: '',
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
  }
}

function ledger(leads = []) {
  return { schema: 'supermega.website.lead-ledger.v1', revision: 0, leads }
}

// 1. Empty ledger
{
  const r = projectWebsiteLeadNameBrief(ledger())
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.uniqueNames === 0, 'empty: uniqueNames 0')
  check(r.topName === null, 'empty: topName null')
  check(r.topNameCount === 0, 'empty: topNameCount 0')
}

// 2. Single lead — one unique name
{
  const r = projectWebsiteLeadNameBrief(ledger([lead('Alice')]))
  check(r.totalLeads === 1, 'single: totalLeads 1')
  check(r.uniqueNames === 1, 'single: uniqueNames 1')
  check(r.topName === 'Alice', 'single: topName Alice')
  check(r.topNameCount === 1, 'single: topNameCount 1')
}

// 3. Two leads with same name — uniqueNames 1, topCount 2
{
  const r = projectWebsiteLeadNameBrief(ledger([lead('Bob'), lead('Bob')]))
  check(r.totalLeads === 2, 'same-name: totalLeads 2')
  check(r.uniqueNames === 1, 'same-name: uniqueNames 1')
  check(r.topName === 'Bob', 'same-name: topName Bob')
  check(r.topNameCount === 2, 'same-name: topNameCount 2')
}

// 4. Two leads with different names — uniqueNames 2
{
  const r = projectWebsiteLeadNameBrief(ledger([lead('Carol'), lead('Dave')]))
  check(r.totalLeads === 2, 'two-diff: totalLeads 2')
  check(r.uniqueNames === 2, 'two-diff: uniqueNames 2')
  check(r.topNameCount === 1, 'two-diff: topNameCount 1')
  check(r.topName !== null, 'two-diff: topName set')
}

// 5. Three leads: one name appears twice — dominant topName
{
  const r = projectWebsiteLeadNameBrief(ledger([
    lead('Eve'),
    lead('Frank'),
    lead('Eve'),
  ]))
  check(r.totalLeads === 3, 'dominant: totalLeads 3')
  check(r.uniqueNames === 2, 'dominant: uniqueNames 2')
  check(r.topName === 'Eve', 'dominant: topName Eve')
  check(r.topNameCount === 2, 'dominant: topNameCount 2')
}

// 6. Three leads all different — uniqueNames 3, topCount 1
{
  const r = projectWebsiteLeadNameBrief(ledger([
    lead('Grace'),
    lead('Henry'),
    lead('Iris'),
  ]))
  check(r.totalLeads === 3, 'all-diff: totalLeads 3')
  check(r.uniqueNames === 3, 'all-diff: uniqueNames 3')
  check(r.topNameCount === 1, 'all-diff: topNameCount 1')
}

console.log(`website-lead-name-brief: ${checks} checks passed`)
