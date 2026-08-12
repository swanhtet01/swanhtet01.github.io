import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLeadContactBrief } from './website-lead-contact-brief.ts'`,
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

const { projectWebsiteLeadContactBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let leadId = 0
function lead(contact = 'customer@example.com') {
  leadId++
  return {
    id: `lead-${leadId}`,
    siteName: 'Test Site',
    sourcePage: '/contact',
    name: `Customer ${leadId}`,
    contact,
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
  const r = projectWebsiteLeadContactBrief(ledger())
  check(r.totalLeads === 0, 'empty: totalLeads 0')
  check(r.uniqueContacts === 0, 'empty: uniqueContacts 0')
  check(r.topContact === null, 'empty: topContact null')
  check(r.topContactCount === 0, 'empty: topContactCount 0')
}

// 2. Single lead — one unique contact
{
  const r = projectWebsiteLeadContactBrief(ledger([lead('a@example.com')]))
  check(r.totalLeads === 1, 'single: totalLeads 1')
  check(r.uniqueContacts === 1, 'single: uniqueContacts 1')
  check(r.topContact === 'a@example.com', 'single: topContact')
  check(r.topContactCount === 1, 'single: topContactCount 1')
}

// 3. Two leads with same contact — uniqueContacts 1, topCount 2
{
  const r = projectWebsiteLeadContactBrief(ledger([lead('b@example.com'), lead('b@example.com')]))
  check(r.totalLeads === 2, 'same-contact: totalLeads 2')
  check(r.uniqueContacts === 1, 'same-contact: uniqueContacts 1')
  check(r.topContact === 'b@example.com', 'same-contact: topContact')
  check(r.topContactCount === 2, 'same-contact: topContactCount 2')
}

// 4. Two leads with different contacts — uniqueContacts 2
{
  const r = projectWebsiteLeadContactBrief(ledger([lead('c@example.com'), lead('d@example.com')]))
  check(r.totalLeads === 2, 'two-diff: totalLeads 2')
  check(r.uniqueContacts === 2, 'two-diff: uniqueContacts 2')
  check(r.topContactCount === 1, 'two-diff: topContactCount 1')
  check(r.topContact !== null, 'two-diff: topContact set')
}

// 5. Three leads: one contact appears twice — dominant topContact
{
  const r = projectWebsiteLeadContactBrief(ledger([
    lead('e@example.com'),
    lead('f@example.com'),
    lead('e@example.com'),
  ]))
  check(r.totalLeads === 3, 'dominant: totalLeads 3')
  check(r.uniqueContacts === 2, 'dominant: uniqueContacts 2')
  check(r.topContact === 'e@example.com', 'dominant: topContact e@example.com')
  check(r.topContactCount === 2, 'dominant: topContactCount 2')
}

// 6. Three leads all different — uniqueContacts 3, topCount 1
{
  const r = projectWebsiteLeadContactBrief(ledger([
    lead('g@example.com'),
    lead('h@example.com'),
    lead('i@example.com'),
  ]))
  check(r.totalLeads === 3, 'all-diff: totalLeads 3')
  check(r.uniqueContacts === 3, 'all-diff: uniqueContacts 3')
  check(r.topContactCount === 1, 'all-diff: topContactCount 1')
}

console.log(`website-lead-contact-brief: ${checks} checks passed`)
